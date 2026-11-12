import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useApp } from '../../state/store';
import { money } from '../../lib/time';
import { scrollToId } from './data';
import { reply } from './botEngine';

gsap.registerPlugin(useGSAP);

const ROBOT = '/images/ai-robot.png';
const GREETED = 'airrest-bot-greeted';
const MINI = 'airrest-bot-mini';
const QUICK = ['Tìm nơi nghỉ gần Nội Bài dưới 700k', 'Tra chuyến bay VN218', 'Theo dõi booking', 'Chính sách hủy', 'Gửi yêu cầu hỗ trợ'];
const WELCOME = { id: 0, from: 'bot', text: 'Xin chào! Mình là trợ lý AIRREST. Bạn đang gặp sự cố chuyến bay hay cần tìm nơi nghỉ gần sân bay? (Mình trả lời theo kịch bản mô phỏng, không phải AI thật.)' };
const CHIP = 'tw:shrink-0 tw:rounded-full tw:border tw:border-blue-200 tw:bg-white tw:px-3 tw:py-2 tw:text-[11px] tw:font-bold tw:text-blue-700 tw:hover:bg-blue-50';

const safe = (fn) => { try { return fn(); } catch { return null; } }; // sessionStorage có thể bị chặn

// Bong bóng trợ lý chat: robot nổi góc phải dưới, bấm mở khung chat. Trả lời theo kịch bản (botEngine), không gọi dịch vụ ngoài.
export default function ChatBot() {
  const { state, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const [greet, setGreet] = useState(false);
  const [mini, setMini] = useState(() => !!safe(() => sessionStorage.getItem(MINI))); // robot đã thu nhỏ thành nút chat
  const [messages, setMessages] = useState([WELCOME]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const root = useRef(null);
  const log = useRef(null);
  const input = useRef(null);
  const seq = useRef(1);

  useEffect(() => {
    if (mini || safe(() => sessionStorage.getItem(GREETED))) return undefined;
    const t = window.setTimeout(() => setGreet(true), 1500);
    return () => window.clearTimeout(t);
  }, []);
  const dismissGreet = () => { setGreet(false); safe(() => sessionStorage.setItem(GREETED, '1')); };
  const minimize = () => { dismissGreet(); setMini(true); safe(() => sessionStorage.setItem(MINI, '1')); };
  const openChat = () => { dismissGreet(); setOpen(true); };

  useEffect(() => {
    if (!open) return undefined;
    input.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, typing, open]);

  const push = (m) => setMessages((list) => [...list, { id: seq.current++, ...m }]);
  const send = async (raw) => {
    const q = raw.trim();
    if (!q || typing) return;
    setText(''); push({ from: 'user', text: q }); setTyping(true);
    const [r] = await Promise.all([reply(q, { airport: state.browseAirport }), new Promise((res) => setTimeout(res, 450))]);
    setTyping(false); push({ from: 'bot', ...r });
  };
  const run = (act) => {
    setOpen(false);
    if (act.type === 'openProperty') dispatch({ type: 'openProperty', id: act.id });
    else if (act.type === 'go') dispatch({ type: 'go', screen: act.screen });
    else { dispatch({ type: 'go', screen: 'home' }); scrollToId('stays'); return; }
    window.scrollTo({ top: 0 });
  };

  // Hiệu ứng: robot lơ lửng, lời chào, khung chat, tin mới. Chỉ opacity/transform; bỏ qua khi người dùng yêu cầu giảm chuyển động.
  useGSAP(() => {
    if (open || mini) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.to('[data-robot]', { y: -7, duration: 1.7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [open, mini], revertOnUpdate: true });
  useGSAP(() => {
    if (!greet) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-greet]', { opacity: 0, y: 10, scale: 0.92, duration: 0.4, ease: 'back.out(1.6)', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [greet] });
  useGSAP(() => {
    if (!open) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-chat]', { opacity: 0, y: 24, scale: 0.96, transformOrigin: 'bottom right', duration: 0.28, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [open] });
  useGSAP(() => {
    const last = gsap.utils.toArray('[data-msg]').at(-1);
    if (!open || !last) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(last, { opacity: 0, y: 10, duration: 0.25, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [messages.length] });

  return (
    <div ref={root} className="tw:fixed tw:bottom-20 tw:right-3 tw:z-[60] tw:md:bottom-6 tw:md:right-6">
      {!open && mini && (
        <button type="button" onClick={openChat} aria-label="Mở trợ lý chat AIRREST" className="tw:grid tw:size-12 tw:cursor-pointer tw:place-items-center tw:rounded-full tw:bg-[#1262e8] tw:text-white tw:shadow-xl tw:hover:bg-[#0b45c6]"><MessageCircle size={22} /></button>
      )}
      {!open && !mini && (
        <div className="tw:relative tw:flex tw:flex-col tw:items-end">
          {greet && (
            <div data-greet className="tw:mb-1 tw:mr-2 tw:flex tw:max-w-[220px] tw:items-start tw:gap-2 tw:rounded-2xl tw:rounded-br-sm tw:bg-white tw:p-3 tw:text-xs tw:font-semibold tw:leading-5 tw:text-slate-700 tw:shadow-xl tw:ring-1 tw:ring-slate-200">
              <button type="button" onClick={openChat} className="tw:text-left">Mình có thể giúp gì cho bạn? 👋</button>
              <button type="button" onClick={dismissGreet} aria-label="Ẩn lời chào" className="tw:shrink-0 tw:text-slate-400 tw:hover:text-slate-600"><X size={14} /></button>
            </div>
          )}
          <div className="tw:relative">
            <button type="button" onClick={openChat} aria-label="Mở trợ lý chat AIRREST" className="tw:block tw:cursor-pointer tw:drop-shadow-xl">
              <img data-robot src={ROBOT} alt="" width="300" height="304" className="tw:size-28 tw:will-change-transform tw:md:size-40" />
            </button>
            <button type="button" onClick={minimize} aria-label="Thu nhỏ trợ lý" className="tw:absolute tw:right-1 tw:top-1 tw:grid tw:size-7 tw:place-items-center tw:rounded-full tw:bg-slate-900/70 tw:text-white tw:shadow tw:hover:bg-slate-900"><X size={14} /></button>
          </div>
        </div>
      )}

      {open && (
        <section data-chat role="dialog" aria-label="Trợ lý AIRREST" className="tw:flex tw:h-[70dvh] tw:max-h-[560px] tw:w-[calc(100vw-1.5rem)] tw:flex-col tw:overflow-hidden tw:rounded-3xl tw:bg-white tw:shadow-2xl tw:ring-1 tw:ring-slate-200 tw:sm:w-[380px]">
          <header className="tw:flex tw:items-center tw:gap-3 tw:bg-[#062253] tw:px-4 tw:py-3 tw:text-white">
            <span className="tw:grid tw:size-11 tw:shrink-0 tw:place-items-center tw:overflow-hidden tw:rounded-full tw:bg-white"><img src={ROBOT} alt="" className="tw:size-10 tw:object-contain" /></span>
            <div className="tw:min-w-0 tw:flex-1"><strong className="tw:block tw:text-sm">Trợ lý AIRREST</strong><span className="tw:text-[10px] tw:text-blue-200">Trả lời theo kịch bản · dữ liệu mô phỏng</span></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng trợ lý chat" className="tw:grid tw:size-9 tw:place-items-center tw:rounded-full tw:bg-white/10 tw:hover:bg-white/20"><X size={16} /></button>
          </header>

          <div ref={log} role="log" aria-live="polite" className="tw:flex-1 tw:space-y-3 tw:overflow-y-auto tw:bg-slate-50 tw:p-4">
            {messages.map((m) => (
              <div data-msg key={m.id} className={`tw:flex ${m.from === 'user' ? 'tw:justify-end' : 'tw:justify-start'}`}>
                <div className={`tw:max-w-[88%] tw:rounded-2xl tw:px-3.5 tw:py-2.5 tw:text-xs tw:leading-5 ${m.from === 'user' ? 'tw:rounded-br-sm tw:bg-blue-600 tw:text-white' : 'tw:rounded-bl-sm tw:bg-white tw:text-slate-700 tw:shadow-sm tw:ring-1 tw:ring-slate-200'}`}>
                  <p className="tw:whitespace-pre-line">{m.text}</p>
                  {m.hotels && <div className="tw:mt-3 tw:grid tw:gap-2">{m.hotels.map((h) => (
                    <button type="button" key={h.id} onClick={() => run({ type: 'openProperty', id: h.id })} className="tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:p-2.5 tw:text-left tw:hover:border-blue-300">
                      <strong className="tw:block tw:text-slate-800">{h.name}</strong>
                      <span className="tw:text-[10px] tw:text-slate-500">{h.distanceKm} km · {h.travelMinutes} phút đi xe · còn {h.room.availableRooms} phòng</span>
                      <span className="tw:mt-1 tw:block tw:font-bold tw:text-blue-700">{money(h.room.price)} / đêm</span>
                    </button>
                  ))}</div>}
                  {m.actions && <div className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-2">{m.actions.map((a) => <button type="button" key={a.label} onClick={() => run(a.act)} className="tw:rounded-full tw:border tw:border-blue-200 tw:bg-blue-50 tw:px-3 tw:py-1.5 tw:text-[11px] tw:font-bold tw:text-blue-700 tw:hover:bg-blue-100">{a.label}</button>)}</div>}
                </div>
              </div>
            ))}
            {typing && <div className="tw:flex tw:justify-start"><span className="tw:rounded-2xl tw:rounded-bl-sm tw:bg-white tw:px-3.5 tw:py-2.5 tw:text-xs tw:text-slate-400 tw:shadow-sm tw:ring-1 tw:ring-slate-200">Đang trả lời…</span></div>}
          </div>

          <div className="tw:flex tw:gap-2 tw:overflow-x-auto tw:border-t tw:border-slate-200 tw:bg-white tw:px-3 tw:py-2 tw:[scrollbar-width:none]">{QUICK.map((q) => <button type="button" key={q} onClick={() => send(q)} className={CHIP}>{q}</button>)}</div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="tw:flex tw:items-center tw:gap-2 tw:border-t tw:border-slate-200 tw:bg-white tw:p-3">
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Nhập câu hỏi của bạn…" aria-label="Nhập câu hỏi" className="tw:min-w-0 tw:flex-1" />
            <button disabled={!text.trim() || typing} aria-label="Gửi" className="tw:grid tw:size-11 tw:shrink-0 tw:place-items-center tw:rounded-xl tw:bg-blue-600 tw:text-white tw:disabled:opacity-50"><Send size={16} /></button>
          </form>
        </section>
      )}
    </div>
  );
}
