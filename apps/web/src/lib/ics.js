// Tạo tệp lịch iCalendar (RFC 5545) để người dùng tự đặt nhắc trong ứng dụng lịch của họ (MB-08 “fallback lịch”).
// Chưa kiểm chứng khả năng báo thức của từng ứng dụng lịch: cần thử nghiệm thực tế (D-03).
import { dateAt, pad } from './time';

const stamp = (abs) => {
  const d = dateAt(abs);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
};
const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

export function buildIcs({ leaveAbs, title, description, uid }) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airrest//Prototype mo phong//VI', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${uid}@airrest.local`, `DTSTAMP:${stamp(leaveAbs)}`,
    `DTSTART:${stamp(leaveAbs)}`, `DTEND:${stamp(leaveAbs + 15)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(description)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:-PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export function downloadIcs(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
