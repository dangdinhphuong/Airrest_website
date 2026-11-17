# SePay SDK cho Node.js

## Tích hợp Cổng thanh toán SePay trong Node.js bằng SDK chính thức, hỗ trợ QR chuyển khoản, thẻ quốc tế và xử lý thông báo IPN.

---

**API Overview:**

API cổng thanh toán SePay hỗ trợ nhiều phương thức thanh toán bao gồm chuyển khoản ngân hàng qua QR code, NAPAS QR và thẻ quốc tế.

**Base URLs:**
- Production API: `https://pgapi.sepay.vn`
- Sandbox API: `https://pgapi-sandbox.sepay.vn`
- Production Checkout: `https://pay.sepay.vn`
- Sandbox Checkout: `https://pay-sandbox.sepay.vn`

**Xác thực:** Tất cả API sử dụng Basic Authentication với `merchant_id` và `secret_key`.


---

> **Cảnh báo: Yêu cầu**
>
> Node 16 hoặc cao hơn

## Cài đặt

**Cài đặt**

```js
npm i sepay-pg-node
```

***

## Khởi tạo Client

**Khởi tạo client**

```js
import { SePayPgClient } from 'sepay-pg-node';

const client = new SePayPgClient({
env: 'sandbox',
merchant_id: 'YOUR_MERCHANT_ID',
secret_key: 'YOUR_MERCHANT_SECRET_KEY'
});
```

**Giải thích tham số**

| Tên | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| env | string | Có | Môi trường hiện tại, giá trị hỗ trợ: sandbox, production |
| merchant_id | string | Có | Mã đơn vị merchant |
| secret_key | string | Có | Khóa bảo mật merchant |

***

## Khởi tạo đối tượng cho biểu mẫu thanh toán (Đơn hàng thanh toán 1 lần)

**Tạo URL thanh toán**

```js
const checkoutURL = client.checkout.initCheckoutUrl();
```

**Khởi tạo thanh toán một lần**

```js
const checkoutFormfields = client.checkout.initOneTimePaymentFields({
operation: 'PURCHASE',
payment_method: 'CARD' | 'BANK_TRANSFER' | 'NAPAS_BANK_TRANSFER',
order_invoice_number: string,
order_amount: number,
currency: string,
order_description?: string,
customer_id?: string,
success_url?: string,
error_url?: string,
cancel_url?: string,
custom_data?: string,
});
```

**Giải thích tham số**

| Tên | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| operation | string | Có | Loại giao dịch, hiện chỉ hỗ trợ: PURCHASE |
| payment_method | string | Có | Phương thức thanh toán: CARD, BANK_TRANSFER, NAPAS_BANK_TRANSFER |
| order_invoice_number | string | Có | Mã đơn hàng/hoá đơn (duy nhất) |
| order_amount | string | Có | Số tiền giao dịch |
| currency | string | Có | Đơn vị tiền tệ (VD: VND, USD) |
| order_description | string | Không | Mô tả đơn hàng |
| customer_id | string | Không | Mã khách hàng (nếu có) |
| success_url | string | Không | URL callback khi thanh toán thành công |
| error_url | string | Không | URL callback khi xảy ra lỗi |
| cancel_url | string | Không | URL callback khi người dùng hủy thanh toán |
| custom_data | string | Không | Dữ liệu tuỳ chỉnh (merchant tự định nghĩa) |

**Json trả về**

```json
{
  "merchant": "string",
  "operation": "string",
  "payment_method": "string",
  "order_invoice_number": "string",
  "order_amount": "string",
  "currency": "string",
  "order_description": "string",
  "customer_id": "string",
  "success_url": "string",
  "error_url": "string",
  "cancel_url": "string",
  "custom_data": "string",
  "signature": "string"
}
```

**Tạo form xử lý thanh toán**

> **Quan trọng: Lưu ý quan trọng về tạo form HTML và chữ ký**
>
> Nếu bạn tự dựng form HTML và xây dựng hàm tạo chữ ký không theo code mẫu thì cần phải đảm bảo thứ tự các trường giống như danh sách tham số ở trên để quá trình ký khớp tuyệt đối phía SePay; Nếu bạn hoán đổi vị trí các trường thì có thể dẫn đến chữ ký bị sai và SePay sẽ xem yêu cầu này là không hợp lệ

**Form thanh toán**

```js
return (
<form action={checkoutURL} method="POST">
  {Object.keys(checkoutFormfields).map(field => (
    <input type="hidden" name={field} value={checkoutFormfields[field]} />
  ))}
  <button type="submit">Thanh toán</button>
</form>
);
```

***

## API

> **Mẹo**
>
> SDK cung cấp các phương thức để gọi Open API cho cổng thanh toán SePay.

**Tra cứu danh sách đơn hàng**

```js
const fetchOrders = async () => {
try {
  const orders = await client.order.all({
    per_page: 20,
    q: 'search-keyword',
    order_status: 'COMPLETED',
    created_at: '2025-10-13',
    from_created_at: '2025-10-01',
    to_created_at: '2025-10-13',
    customer_id: null,
    sort: {
      created_at: 'desc'
    }
  });

  console.log('Orders:', orders.data);
} catch (error) {
  console.error('Error fetching orders:', error);
}
};
```

**Xem chi tiết đơn hàng**

```js
const fetchOrderDetail = async (orderInvoiceNumber) => {
try {
  const order = await client.order.retrieve(orderInvoiceNumber);
  console.log('Order detail:', order.data);
} catch (error) {
  console.error('Error fetching order detail:', error);
}
};
```

**Hủy giao dịch đơn hàng (dành cho thanh toán bằng thẻ tín dụng)**

```js
const voidTransaction = async (orderInvoiceNumber) => {
try {
  const response = await client.order.voidTransaction(orderInvoiceNumber);
  console.log('Transaction voided successfully:', response.data);
} catch (error) {
  console.error('Error voiding transaction:', error);
}
};
```

**Hủy đơn hàng (dành cho thanh toán bằng quét mã QR)**

```js
const cancelOrder = async (orderInvoiceNumber) => {
try {
  const response = await client.order.cancel(orderInvoiceNumber);
  console.log('Order cancelled successfully:', response.data);
} catch (error) {
  console.error('Error cancelling order:', error);
}
};
```

***

> **Mẹo**
>
> Xem chi tiết hướng dẫn cài đặt và sử dụng tại **[GitHub Repository](https://github.com/sepayvn/sepay-pg-node)**
