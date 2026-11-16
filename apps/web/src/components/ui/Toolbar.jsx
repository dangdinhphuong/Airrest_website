import React from 'react';

// Thanh công cụ trên bảng: `children` bên trái (tìm kiếm, đếm kết quả), `end` bên phải (nút hành động).
export function Toolbar({ children, end, label }) {
  return <div className="ui-toolbar" role="toolbar" aria-label={label}><div className="ui-toolbar-main">{children}</div>{end && <div className="ui-toolbar-end">{end}</div>}</div>;
}
