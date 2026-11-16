import React from 'react';
import { EmptyState, ErrorState, Loading } from './states';

// Phân trang theo số trang (xlvm TablePagination): ẩn khi chỉ có 1 trang. testid page-prev / page-next như Pager cũ.
export function Pagination({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="pager" role="navigation" aria-label="Phân trang">
      <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="page-prev">Trước</button>
      <span>Trang {page}/{pages}</span>
      <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid="page-next">Sau</button>
    </div>
  );
}

// Bảng dữ liệu (xlvm DataGrid): columns = [{ key, header, render?(row), align?, width?, className? }]; render mặc định row[key].
// Trạng thái: loading (lần đầu) · error (+onRetry) · rỗng (empty) · dữ liệu. Phân trang số (page/pages/onPage) HOẶC keyset "Tải thêm"
// (hasMore/onLoadMore/loadingMore). Trên mobile mỗi hàng thành thẻ (td có data-label). Mỗi hàng data-testid="row".
export function DataTable({
  columns, rows = [], rowKey = (r) => r.id, loading, error, onRetry, empty = 'Không có dữ liệu.', emptyTitle = 'Chưa có dữ liệu',
  page, pages, onPage, hasMore, onLoadMore, loadingMore, caption, onRowClick, rowClass, testid, rowTestid = 'row',
}) {
  if (error && !rows.length) return <ErrorState onRetry={onRetry}>{error}</ErrorState>;
  if (loading && !rows.length) return <Loading />;
  if (!rows.length) return <EmptyState title={emptyTitle} testid="empty">{empty}</EmptyState>;
  return (
    <>
      <div className="table-wrap ui-table-wrap" data-testid={testid}>
        <table className="rights-table ui-table">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead><tr>{columns.map((c) => <th key={c.key || c.header} scope="col" style={{ textAlign: c.align, width: c.width }}>{c.header}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} data-testid={rowTestid} className={rowClass?.(r)} onClick={onRowClick && (() => onRowClick(r))} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                {columns.map((c) => <td key={c.key || c.header} data-label={typeof c.header === 'string' ? c.header : undefined} className={c.className} style={{ textAlign: c.align }}>{c.render ? c.render(r, i) : r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <Pagination page={page} pages={pages} onPage={onPage} />
      {hasMore && <div className="row-actions"><button type="button" className="btn" onClick={onLoadMore} disabled={loadingMore} data-testid="load-more">{loadingMore ? 'Đang tải…' : 'Tải thêm'}</button></div>}
    </>
  );
}
