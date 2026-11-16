# components/ui — bộ component dùng chung cho cổng Khách sạn / Quản trị

Hình dáng/hành vi theo `xlvm` (react/apps/xlvm), dùng token màu + phông của Airrest (styles.css). CSS ở `src/shell.css` (phần "components/ui"). Import: `import { PageHeader, DataTable } from '../ui';`

Khung (`components/shell/StaffShell.jsx`) đã vẽ header, sidebar cây, **breadcrumb** và vùng nội dung. Mỗi màn tab chỉ cần: `PageHeader` → (`Tabs`/`FilterBar`/`Toolbar`) → `DataTable`/nội dung. Không vẽ lại breadcrumb. Thêm tab mới: thêm mục vào `lib/hotelNav.js`/`adminNav.js` với `group`, `need`/`any`.

## Component

| Component | Props chính | Ghi chú |
|---|---|---|
| `PageHeader` | `title`, `description`, `kicker`, `actions` (nút bên phải, nút chính ngoài cùng phải), `back={{onClick,label}}`, `breadcrumbs` (chỉ màn nhiều bước), `children` (dải tóm tắt/tab) | Focus về h1 khi mở màn. `ScreenTitle` cũ là lớp mỏng của nó. |
| `DataTable` | `columns=[{key,header,render?(row),align?,width?}]`, `rows`, `rowKey`, `loading`, `error` (chuỗi), `onRetry`, `empty`, `emptyTitle`, `page`/`pages`/`onPage` (phân trang số) hoặc `hasMore`/`onLoadMore`/`loadingMore` (keyset), `onRowClick`, `testid` | Hàng `data-testid="row"`, ô có `data-label` (mobile thành thẻ). Lần đầu loading → `Loading`; lỗi khi chưa có hàng → `ErrorState`; rỗng → `EmptyState`. |
| `Pagination` | `page`, `pages`, `onPage` | testid `page-prev`/`page-next`. |
| `FilterBar` | `onApply`, `onReset`, `applyLabel`, `actions`, `testid` + children = ô lọc | Là `<form>`: Enter = lọc. Nút `f-apply`, `f-reset`. Ô lọc dùng `input`/`Select` sẵn có. |
| `Toolbar` | `children` (trái), `end` (phải), `label` | Hàng công cụ phía trên bảng. |
| `Tabs` | `tabs=[{id,label,count?}]`, `value`, `onChange`, `label` | testid `sub-<id>` (như SubTabs cũ). |
| `StatusBadge` | `status`, `map` (mặc định `STATUS`: `{MÃ: [nhãn, tone]}`) | tone: ok/warn/error/info/neutral. |
| `Tag` | `tone`, children | = `Pill` cũ. |
| `Modal` | `open`, `onClose`, `title`, `size` (sm/md/lg), `footer`, `locked`, `testid` | Portal, Esc/bấm nền đóng, giữ Tab, trả focus. Phần tử `data-autofocus` nhận focus đầu. |
| `ConfirmDialog` | `open`, `onClose`, `onConfirm(reason?)` (có thể async; ném lỗi thì hộp giữ mở), `title`, `description`, `confirmLabel` (động từ cụ thể), `variant` (info/warning/danger), `reason={{label,minLength,placeholder}}`, `testid` | Thay `ConfirmButton`/`ReasonAction`/`Act` (nút hai bước tại chỗ). testid: `<testid>-confirm`, `-cancel`, `-reason`. |
| `EmptyState` | `title`, children (mô tả), `actions`, `icon` | |
| `ErrorState` | `title`, children (thông điệp), `onRetry` | |
| `Loading` | `label` | |
| `FormField` | `id`, `label`, `hint`, `error`, `required`, children | `id` trùng id của điều khiển. |

Vẫn dùng: `Notice` (components/Common.jsx), `useLoad/usePaged/useAction` (hotel/kit.jsx), `useRun/usePaged/useLoad/LoadView/Act/Filters` (admin/kit.jsx), `Select`. `ConfirmAction` (ui) = nút + `ConfirmDialog`.

Ví dụ:
```jsx
<>
  <PageHeader title="Đặt phòng" description="Đơn của khách sạn" actions={<button className="btn btn-primary">Tạo đơn</button>} />
  <FilterBar onApply={apply} onReset={reset}><input aria-label="Mã đơn" value={q} onChange={...} /></FilterBar>
  <DataTable columns={[{ key: 'code', header: 'Mã' }, { key: 'st', header: 'Trạng thái', render: (r) => <StatusBadge status={r.status} /> }]}
    rows={list.items} loading={list.loading} error={list.err && describeError(list.err)} onRetry={list.reload} hasMore={list.next != null} onLoadMore={list.loadMore} loadingMore={list.more} />
  <ConfirmDialog open={open} onClose={() => setOpen(false)} variant="danger" title="Từ chối đơn?" confirmLabel="Từ chối" reason={{ label: 'Lý do' }} onConfirm={(r) => reject(r)} />
</>
```

## Ánh xạ component cũ → mới

| Cũ | Mới | Tình trạng hiện tại |
|---|---|---|
| `Common.ScreenTitle` | `PageHeader` | còn là lớp mỏng trong Common.jsx (không màn nào dùng nữa) |
| `Common.Loading` / `ErrorBox` / `EmptyBox` / `Field` | `Loading` / `ErrorState` / `EmptyState` / `FormField` | lớp mỏng trong Common.jsx |
| `Common.Notice`, `SimBadge`, `SourceLine` | giữ nguyên | chưa có bản mới |
| `partner/ui.Pill`, `SubTabs` | `Tag`, `Tabs` | lớp mỏng còn lại trong `partner/ui.jsx` (cùng `Kpi`, giữ `stat-grid`) cho tab Quản trị |
| `partner/ui.Pager`, `ReasonAction` | `Pagination`, `ConfirmAction`/`ConfirmDialog` + `reason` | **đã gỡ** |
| `hotel/kit.StatusPill`, `STATUS`, `ListState`, `ConfirmButton` | `StatusBadge`/`STATUS`, `DataTable`/`EmptyState`/`ErrorState`, `ConfirmAction` | **đã gỡ**; `hotel/kit.jsx` chỉ còn `fmtD`, `fmtDT`, `today`, `useLoad`, `usePaged` (keyset), `useAction` |
| `admin/kit.Table` (`cols=[[h, fn]]`) | `DataTable` + helper `cols([...])`, `pagedProps(usePaged(...))` | **đã gỡ** |
| `admin/kit.PagedView` | `DataTable {...pagedProps(p)}` | **đã gỡ** |
| `admin/kit.Back` | `PageHeader back={{onClick}}` | **đã gỡ** |
| `admin/kit.Act` | `ConfirmDialog` (không đổi tên, bọc sẵn) | còn: nút + hộp xác nhận, `onDo` trả `{ok}` của `useRun.run` |
| `admin/kit.Filters` | bọc `FilterBar` | còn (giữ API `fields`) |
| `admin/kit.LoadView`, `useRun`, `usePaged`, `useLoad`, `errText`, `AirportSelect`... | giữ | còn trong `admin/kit.jsx` |
| `ConfirmAction` (mới, `ui/ConfirmAction.jsx`) | nút mở `ConfirmDialog`: `label`, `ask`, `title`, `confirmLabel`, `onConfirm`, `tone="danger"`, `reason`, `testid` | thay `ConfirmButton`/`ReasonAction` ở cổng Khách sạn |
| `Layout.jsx` (Header/AppNav/Breadcrumb/Footer) | `shell/StaffShell`, `shell/Breadcrumb` | đã xóa |
