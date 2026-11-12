import { z, ZodIssueCode, ZodParsedType, type ZodErrorMap } from 'zod';

// Thông báo lỗi zod mặc định bằng tiếng Việt (message tự đặt trong schema vẫn được ưu tiên).
// Cấu trúc issue (code, path, ...) giữ nguyên; chỉ `message` đổi.
const typeName: Record<string, string> = {
  string: 'chuỗi', number: 'số', boolean: 'đúng/sai', array: 'danh sách', object: 'đối tượng', date: 'ngày', integer: 'số nguyên', bigint: 'số lớn', undefined: 'không có giá trị', null: 'null',
};
const t = (x: string) => typeName[x] ?? x;
const unit = (type: string, n: number | bigint) => (type === 'string' ? `${n} ký tự` : type === 'array' || type === 'set' ? `${n} phần tử` : String(n));

export const viErrorMap: ZodErrorMap = (issue, ctx) => {
  let message: string;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      message = issue.received === ZodParsedType.undefined ? 'Bắt buộc nhập' : `Sai kiểu dữ liệu (cần ${t(issue.expected)}, nhận ${t(issue.received)})`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === 'object') message = 'Chuỗi không hợp lệ';
      else
        message =
          ({ email: 'Email không hợp lệ', url: 'URL không hợp lệ', uuid: 'Mã không hợp lệ', datetime: 'Thời điểm phải dạng ISO 8601', date: 'Ngày không hợp lệ', regex: 'Định dạng không hợp lệ' } as Record<string, string>)[issue.validation] ?? 'Chuỗi không hợp lệ';
      break;
    case ZodIssueCode.too_small: {
      const exact = issue.exact;
      const kind = issue.type === 'string' || issue.type === 'array' || issue.type === 'set';
      message = kind
        ? exact
          ? `Phải có đúng ${unit(issue.type, issue.minimum)}`
          : `Phải có ${issue.inclusive ? 'ít nhất' : 'nhiều hơn'} ${unit(issue.type, issue.minimum)}`
        : `Giá trị phải ${issue.inclusive ? 'lớn hơn hoặc bằng' : 'lớn hơn'} ${issue.minimum}`;
      break;
    }
    case ZodIssueCode.too_big: {
      const kind = issue.type === 'string' || issue.type === 'array' || issue.type === 'set';
      message = kind
        ? issue.exact
          ? `Phải có đúng ${unit(issue.type, issue.maximum)}`
          : `Chỉ được có ${issue.inclusive ? 'tối đa' : 'ít hơn'} ${unit(issue.type, issue.maximum)}`
        : `Giá trị phải ${issue.inclusive ? 'nhỏ hơn hoặc bằng' : 'nhỏ hơn'} ${issue.maximum}`;
      break;
    }
    case ZodIssueCode.invalid_enum_value:
      message = `Giá trị không hợp lệ, chỉ nhận: ${issue.options.join(', ')}`;
      break;
    case ZodIssueCode.invalid_literal:
      message = 'Giá trị không hợp lệ';
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Có trường không được hỗ trợ: ${issue.keys.join(', ')}`;
      break;
    case ZodIssueCode.invalid_union:
    case ZodIssueCode.invalid_union_discriminator:
      message = 'Dữ liệu không hợp lệ';
      break;
    case ZodIssueCode.invalid_date:
      message = 'Ngày không hợp lệ';
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Giá trị phải là bội số của ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = 'Số không hợp lệ';
      break;
    default:
      message = ctx.defaultError === 'Invalid input' ? 'Dữ liệu không hợp lệ' : ctx.defaultError;
  }
  return { message };
};

export const installViErrorMap = (): void => z.setErrorMap(viErrorMap);
