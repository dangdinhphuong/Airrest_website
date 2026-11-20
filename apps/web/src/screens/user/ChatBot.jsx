import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Plus, Send, X } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useApp } from '../../state/store';
import { money } from '../../lib/time';
import { ATTACH, attachFile, checkAttachments, describeApiError } from '../../data/user';
import { scrollToId, setStaysIntent } from './data';
import { reply } from './botEngine';
import { beginComplaint } from './botFlows';
import { QUICK_CHIPS, chipLabel, chipText, hotelMeta, hotelPrice, ui } from './botI18n';
import { loadChat, saveChat } from './botStore';

gsap.registerPlugin(useGSAP);

const ROBOT = '/images/ai-robot.png';
const MINI = 'airrest-bot-mini';
// Lời chào đầu theo ngôn ngữ trình duyệt, chỉ với tiếng Trung/Hàn (nhiều người Việt dùng trình duyệt tiếng Anh nên en vẫn mặc định tiếng Việt; bot tự đổi khi khách gõ tiếng Anh).
const initLang = () => { try { const l = (navigator.language || '').slice(0, 2); return l === 'zh' || l === 'ko' ? l : 'vi'; } catch { return 'vi'; } };
const CHIP = 'tw:shrink-0 tw:rounded-full tw:border tw:border-blue-200 tw:bg-white tw:px-3 tw:py-2 tw:text-[11px] tw:font-bold tw:text-blue-700 tw:hover:bg-blue-50';

const safe = (fn) => { try { return fn(); } catch { return null; } }; // sessionStorage có thể bị chặn

// Bong bóng trợ lý chat: robot nổi góc phải dưới, bấm mở khung chat. Trả lời qua botEngine (kịch bản + AI local diễn đạt/hiểu ý), đặt phòng ngay trong chat (botBook).
export default function ChatBot() {
  const { state, dispatch } = useApp();
  const restored = useRef(undefined); // cuộc chat còn lại sau khi tải lại trang (sessionStorage, 2 giờ), chỉ đọc một lần
  if (restored.current === undefined) restored.current = safe(() => loadChat(sessionStorage)) ?? null;
  const [open, setOpen] = useState(false);
  const [greet, setGreet] = useState(false);
  const [mini, setMini] = useState(() => !!safe(() => sessionStorage.getItem(MINI))); // robot đã thu nhỏ thành nút chat
  const [lang, setLang] = useState(() => restored.current?.mem.lang ?? initLang()); // ngôn ngữ khung chat theo cuộc trò chuyện (mem.current.lang do botEngine nhận dạng)
  const [messages, setMessages] = useState(() => restored.current?.messages ?? [{ id: 0, from: 'bot', text: ui(initLang(), 'welcome') }]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const root = useRef(null);
  const log = useRef(null);
  const input = useRef(null);
  const seq = useRef((restored.current?.messages.reduce((mx, m) => Math.max(mx, m.id ?? 0), 0) ?? 0) + 1);
  const mem = useRef(restored.current?.mem ?? (initLang() === 'vi' ? {} : { lang: initLang() })); // trạng thái hội thoại nhiều lượt (botFlows)
  const [staged, setStaged] = useState([]); // tệp đã chọn bằng nút "+", chờ có ticket để đính kèm
  const stagedRef = useRef([]);
  const stage = (fn) => { stagedRef.current = fn(stagedRef.current); setStaged(stagedRef.current); };

  useEffect(() => {
    if (mini) return undefined;
    const t = window.setTimeout(() => setGreet(true), 1500);
    return () => window.clearTimeout(t);
  }, []);
    const minimize = () => { setGreet(false); setMini(true); safe(() => sessionStorage.setItem(MINI, '1')); };
  const openChat = () => setOpen(true);

  useEffect(() => {
    if (!open) return undefined;
    input.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, typing, open]);
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return; } // lần mở trang đầu chưa có tin mới: không làm mới hạn 2 giờ
    safe(() => saveChat(sessionStorage, messages, mem.current)); // mỗi tin mới: lưu để tải lại trang không mất cuộc chat
  }, [messages]);

  const push = (m) => setMessages((list) => [...list, { id: seq.current++, ...m }]);
  // raw: chuỗi gõ tay, hoặc nút bấm ({ label, text } ở ngôn ngữ khác tiếng Việt): hiện nhãn cho khách nhưng gửi giá trị tiếng Việt chuẩn, không dịch lại.
  const send = async (raw, opts = {}) => {
    const q = chipText(raw).trim();
    if (!q || typing) return;
    setText(''); push({ from: 'user', text: chipLabel(raw).trim() }); setTyping(true);
    const [r] = await Promise.all([reply(q, { airport: state.browseAirport, user: state.user, mem: mem.current, chip: typeof raw !== 'string' || !!opts.chip }).catch((e) => ({ text: `Mình gặp lỗi: ${e?.message ?? 'không xác định'}. Bạn thử lại giúp mình nhé.` })), new Promise((res) => setTimeout(res, 450))]);
    setTyping(false); push({ from: 'bot', ...r }); setLang(mem.current.lang ?? 'vi');
    if (r.redirect) window.setTimeout(() => window.location.assign(r.redirect), 1500); // đơn trả online vừa tạo: sang trang thanh toán (nút "Thanh toán ngay" là dự phòng)
    if (r.attach && stagedRef.current.length) { const files = stagedRef.current; stage(() => []); await uploadFiles(files, r.attach); } // ticket vừa tạo: gửi các tệp đã chọn trước đó
    else if (!mem.current.flow && stagedRef.current.length) stage(() => []); // luồng khiếu nại đã đóng mà không có ticket: bỏ tệp chờ
  };
  // Ảnh/video làm bằng chứng cho một ticket: tải lần lượt từng tệp, báo kết quả riêng từng tệp.
  const uploadFiles = async (files, { code, phone }) => {
    setTyping(true);
    for (const f of files) {
      push({ from: 'user', text: `📎 ${f.name}` });
      try { await attachFile(code, phone, f); push({ from: 'bot', text: `Đã nhận ${f.name}.` }); } catch (err) { push({ from: 'bot', text: `${f.name}: ${describeApiError(err)}` }); }
    }
    setTyping(false);
  };
  const attach = (e, t) => { const files = [...e.target.files]; e.target.value = ''; if (files.length && !typing) uploadFiles(files, t); }; // nút trong tin nhắn sau khi gửi ticket
  // Nút "+": chọn ảnh/video bất cứ lúc nào. Có ticket vừa gửi/tra thì gửi thẳng vào ticket đó; chưa có thì giữ lại và mở luồng khiếu nại, tự đính kèm khi ticket được tạo.
  const pick = async (e) => {
    const picked = [...e.target.files]; e.target.value = '';
    if (!picked.length || typing) return;
    const { ok, errors } = checkAttachments(picked, stagedRef.current);
    if (errors.length) push({ from: 'bot', text: errors.join('\n') });
    if (!ok.length) return;
    const m = mem.current;
    if (m.lastTicket && !m.flow) {
      push({ from: 'bot', text: `Mình gửi ${ok.length} tệp vào ticket ${m.lastTicket.code}. (Muốn tạo khiếu nại mới, hãy gõ "Gửi khiếu nại" trước rồi chọn tệp.)` });
      await uploadFiles(ok, m.lastTicket);
      return;
    }
    stage((s) => [...s, ...ok]);
    if (!m.flow) push({ from: 'bot', ...beginComplaint(m, `Mình đã nhận ${ok.length} tệp, sẽ đính kèm khi bạn gửi khiếu nại. `) });
    else if (m.flow === 'complaint') push({ from: 'bot', text: `Đã thêm ${ok.length} tệp, sẽ đính kèm khi bạn gửi khiếu nại.` });
    else push({ from: 'bot', text: `Mình giữ ${ok.length} tệp, sẽ đính kèm khi bạn gửi khiếu nại. Bạn hoàn tất việc đang làm hoặc gõ "Gửi khiếu nại".`, chips: ['Gửi khiếu nại'] });
  };
  const run = (act) => {
    if (act.type === 'pay') { window.location.assign(act.url); return; } // url đã được botBook kiểm (chỉ http/https)
    setOpen(false);
    if (act.type === 'openProperty') dispatch({ type: 'openProperty', id: act.id });
    else if (act.type === 'go') dispatch({ type: 'go', screen: act.screen });
    else if (act.type === 'book') { setStaysIntent({ airport: act.airport, hotelId: act.hotelId, party: act.party, dates: act.dates }); dispatch({ type: 'go', screen: 'stays' }); }
    else { dispatch({ type: 'go', screen: 'home' }); scrollToId('stays'); return; }
    window.scrollTo({ top: 0 });
  };

  // Hiệu ứng: robot lơ lửng, lời chào, khung chat, tin mới. Chỉ opacity/transform; bỏ qua khi người dùng yêu cầu giảm chuyển động.
  useGSAP(() => {
    if (open || mini || !root.current?.querySelector('[data-robot]')) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.to('[data-robot]', { y: -7, duration: 1.7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [open, mini], revertOnUpdate: true });
  useGSAP(() => {
    if (!greet || open || mini || !root.current?.querySelector('[data-greet]')) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-greet]', { opacity: 0, y: 10, scale: 0.92, duration: 0.4, ease: 'back.out(1.6)', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [greet, open, mini] });
  useGSAP(() => {
    if (!open || !root.current?.querySelector('[data-chat]')) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-chat]', { opacity: 0, y: 24, scale: 0.96, transformOrigin: 'bottom right', duration: 0.28, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [open] });
  useGSAP(() => {
    const last = open ? gsap.utils.toArray('[data-msg]').at(-1) : null;
    if (!last) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(last, { opacity: 0, y: 10, duration: 0.25, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [messages.length] });

  return (
    <div ref={root} data-chat-fab className="tw:fixed tw:bottom-20 tw:right-3 tw:z-[60] tw:md:bottom-6 tw:md:right-6">
      {!open && mini && (
        <button type="button" onClick={openChat} aria-label="Mở trợ lý chat AIRREST" className="tw:grid tw:size-12 tw:cursor-pointer tw:place-items-center tw:rounded-full tw:bg-[#1262e8] tw:text-white tw:shadow-xl tw:hover:bg-[#0b45c6]"><MessageCircle size={22} /></button>
      )}
      {!open && !mini && (
        <div className="tw:relative tw:flex tw:flex-col tw:items-end">
          {greet && (
            <div data-greet className="tw:mb-1 tw:mr-2 tw:flex tw:max-w-[190px] tw:items-start tw:gap-2 tw:rounded-2xl tw:rounded-br-sm tw:bg-white tw:p-3 tw:text-xs tw:font-semibold tw:leading-5 tw:text-slate-700 tw:shadow-xl tw:ring-1 tw:ring-slate-200">
              <button type="button" onClick={openChat} className="tw:text-left">Mình có thể giúp gì cho bạn? 👋</button>
              <button type="button" onClick={minimize} aria-label="Đóng trợ lý" className="tw:-m-2 tw:shrink-0 tw:p-2 tw:text-slate-400 tw:hover:text-slate-600"><X size={14} /></button>
            </div>
          )}
          <div className="tw:relative">
            <button type="button" onClick={openChat} aria-label="Mở trợ lý chat AIRREST" className="tw:block tw:cursor-pointer tw:drop-shadow-xl">
              <img data-robot src={ROBOT} alt="" width="300" height="304" className="tw:size-20 tw:will-change-transform tw:md:size-40" />
            </button>
          </div>
        </div>
      )}

      {open && (
        <section data-chat role="dialog" aria-label="Trợ lý AIRREST" className="tw:flex tw:h-[70dvh] tw:max-h-[560px] tw:w-[calc(100vw-1.5rem)] tw:flex-col tw:overflow-hidden tw:rounded-3xl tw:bg-white tw:shadow-2xl tw:ring-1 tw:ring-slate-200 tw:sm:w-[380px]">
          <header className="tw:flex tw:items-center tw:gap-3 tw:bg-[#062253] tw:px-4 tw:py-3 tw:text-white">
            <span className="tw:grid tw:size-11 tw:shrink-0 tw:place-items-center tw:overflow-hidden tw:rounded-full tw:bg-white"><img src={ROBOT} alt="" className="tw:size-10 tw:object-contain" /></span>
            <div className="tw:min-w-0 tw:flex-1"><strong className="tw:block tw:text-sm">Trợ lý AIRREST</strong><span className="tw:text-[11px] tw:text-blue-200">{ui(lang, 'subtitle')}</span></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng trợ lý chat" className="tw:grid tw:size-9 tw:place-items-center tw:rounded-full tw:bg-white/10 tw:hover:bg-white/20"><X size={16} /></button>
          </header>

          <div ref={log} role="log" aria-live="polite" className="tw:flex-1 tw:space-y-3 tw:overflow-y-auto tw:bg-slate-50 tw:p-4">
            {messages.map((m, i) => (
              <div data-msg key={m.id} className={`tw:flex ${m.from === 'user' ? 'tw:justify-end' : 'tw:justify-start'}`}>
                <div className={`tw:max-w-[88%] tw:rounded-2xl tw:px-3.5 tw:py-2.5 tw:text-xs tw:leading-5 ${m.from === 'user' ? 'tw:rounded-br-sm tw:bg-blue-600 tw:text-white' : 'tw:rounded-bl-sm tw:bg-white tw:text-slate-700 tw:shadow-sm tw:ring-1 tw:ring-slate-200'}`}>
                  <p className="tw:whitespace-pre-line">{m.text}</p>
                  {m.hotels && <div className="tw:mt-3 tw:grid tw:gap-2">{m.hotels.map((h) => (
                    <button type="button" key={h.id} onClick={() => (h.chatBook ? send(h.chatBook, { chip: true }) : run(h.act ?? { type: 'openProperty', id: h.id }))} className="tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:p-2.5 tw:text-left tw:hover:border-blue-300">
                      <strong className="tw:block tw:text-slate-800">{h.name}</strong>
                      <span className="tw:text-[11px] tw:text-slate-500">{hotelMeta(lang, h)}</span>
                      <span className="tw:mt-1 tw:block tw:font-bold tw:text-blue-700">{hotelPrice(lang, h, money)}</span>
                    </button>
                  ))}</div>}
                  {m.actions && <div className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-2">{m.actions.map((a) => <button type="button" key={a.label} onClick={() => run(a.act)} className="tw:rounded-full tw:border tw:border-blue-200 tw:bg-blue-50 tw:px-3 tw:py-1.5 tw:text-[11px] tw:font-bold tw:text-blue-700 tw:hover:bg-blue-100">{a.label}</button>)}</div>}
                  {m.attach && <label className="tw:mt-3 tw:inline-flex tw:min-h-9 tw:cursor-pointer tw:items-center tw:gap-1 tw:rounded-full tw:border tw:border-blue-200 tw:bg-blue-50 tw:px-3 tw:py-1.5 tw:text-[11px] tw:font-bold tw:text-blue-700 tw:hover:bg-blue-100"><input type="file" multiple accept={ATTACH.accept} onChange={(e) => attach(e, m.attach)} disabled={typing} className="tw:sr-only" aria-label="Chọn ảnh hoặc video đính kèm" />📎 Chọn ảnh/video</label>}
                  {m.chips && i === messages.length - 1 && !typing && <div className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-2">{m.chips.map((c) => <button type="button" key={chipLabel(c)} onClick={() => send(c, { chip: true })} className="tw:rounded-full tw:border tw:border-slate-300 tw:bg-white tw:px-3 tw:py-1.5 tw:text-[11px] tw:font-semibold tw:text-slate-700 tw:hover:bg-slate-100">{chipLabel(c)}</button>)}</div>}
                </div>
              </div>
            ))}
            {typing && <div className="tw:flex tw:justify-start"><span className="tw:rounded-2xl tw:rounded-bl-sm tw:bg-white tw:px-3.5 tw:py-2.5 tw:text-xs tw:text-slate-400 tw:shadow-sm tw:ring-1 tw:ring-slate-200">{ui(lang, 'typing')}</span></div>}
          </div>

          <div className="tw:flex tw:gap-2 tw:overflow-x-auto tw:border-t tw:border-slate-200 tw:bg-white tw:px-3 tw:py-2 tw:[scrollbar-width:none]">{QUICK_CHIPS(lang).map((q) => <button type="button" key={chipLabel(q)} onClick={() => send(q, { chip: true })} className={CHIP}>{chipLabel(q)}</button>)}</div>
          {staged.length > 0 && <div className="tw:flex tw:gap-2 tw:overflow-x-auto tw:border-t tw:border-slate-200 tw:bg-slate-50 tw:px-3 tw:py-2 tw:[scrollbar-width:none]" aria-label="Tệp đã chọn">{staged.map((f, i) => <span key={`${f.name}-${i}`} className="tw:inline-flex tw:max-w-[180px] tw:shrink-0 tw:items-center tw:gap-1 tw:rounded-full tw:bg-white tw:px-3 tw:py-1.5 tw:text-[11px] tw:font-semibold tw:text-slate-700 tw:ring-1 tw:ring-slate-200"><span className="tw:truncate">📎 {f.name}</span><button type="button" onClick={() => stage((s) => s.filter((_, j) => j !== i))} aria-label={`Bỏ tệp ${f.name}`} className="tw:-mr-1 tw:p-1 tw:text-slate-400 tw:hover:text-slate-600"><X size={12} /></button></span>)}</div>}
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="tw:flex tw:items-center tw:gap-2 tw:border-t tw:border-slate-200 tw:bg-white tw:p-3">
            <label title="Đính kèm ảnh/video" className={`tw:grid tw:size-11 tw:shrink-0 tw:cursor-pointer tw:place-items-center tw:rounded-xl tw:border tw:border-slate-300 tw:text-slate-600 tw:hover:bg-slate-50 ${typing ? 'tw:opacity-50' : ''}`}><input type="file" multiple accept={ATTACH.accept} onChange={pick} disabled={typing} className="tw:sr-only" aria-label="Đính kèm ảnh hoặc video" /><Plus size={18} /></label>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={ui(lang, 'placeholder')} aria-label={ui(lang, 'placeholder')} className="tw:min-w-0 tw:flex-1" />
            <button disabled={!text.trim() || typing} aria-label={ui(lang, 'send')} className="tw:grid tw:size-11 tw:shrink-0 tw:place-items-center tw:rounded-xl tw:bg-blue-600 tw:text-white tw:disabled:opacity-50"><Send size={16} /></button>
          </form>
        </section>
      )}
    </div>
  );
}
