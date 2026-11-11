/**
 * A03_tao_google_form.gs – Tự tạo Google Form bảng hỏi A03 (35 câu, 7 phần, rẽ nhánh)
 * bằng Google Apps Script. Thứ tự câu hỏi khớp A03_so_ma_bien.py, nên file CSV
 * xuất từ form chạy thẳng được với A06_lam_sach_khao_sat.py.
 *
 * CÁCH DÙNG (khoảng 5 phút):
 *  1. Đăng nhập Google, mở https://script.google.com  →  "New project".
 *  2. Xoá nội dung mặc định, dán toàn bộ file này vào, bấm Ctrl+S.
 *  3. Trên thanh công cụ chọn hàm  taoForm  →  Run  →  cho phép quyền (Forms, Drive).
 *  4. Xem "Execution log": có link chỉnh sửa và link gửi khảo sát. Form nằm trong Google Drive.
 *  5. Mở form → Preview (biểu tượng con mắt) để kiểm tra rẽ nhánh, rồi gửi link.
 *  Sau khi thu dữ liệu: Responses → ⋮ → "Download responses (.csv)"
 *      → python GiaiDoan_A_KhamPha_ThuThap/A06_lam_sach_khao_sat.py <file.csv> --ngay-mo YYYY-MM-DD
 *
 *  Điền 3 chỗ [ ... ] trong LOI_GIOI_THIEU và LINK_FORM_LIEN_HE trước khi chạy.
 */

var LOI_GIOI_THIEU =
  "THÔNG TIN NGHIÊN CỨU VÀ ĐỒNG Ý THAM GIA\n" +
  "Tôi là [Họ tên], sinh viên lớp CNT421 ngành Công nghệ thông tin, đang thực tập tại Công ty CP công nghệ và truyền thông VTC Netviet. " +
  "Khảo sát này phục vụ đề tài \"Nghiên cứu và thiết kế UI/UX cho website hỗ trợ lưu trú khẩn cấp cho hành khách khi chuyến bay bị chậm hoặc huỷ\".\n\n" +
  "• Thời gian: khoảng 8–10 phút. Tham gia hoàn toàn tự nguyện; anh/chị có thể dừng bất kỳ lúc nào.\n" +
  "• Khảo sát KHÔNG thu thập họ tên, email, số điện thoại. Dữ liệu chỉ dùng cho mục đích học tập, tổng hợp dưới dạng thống kê và xoá sau khi kết thúc học phần.\n" +
  "• Việc xử lý dữ liệu tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP. Liên hệ: [email sinh viên].";

var LINK_FORM_LIEN_HE = "[dán link form liên hệ riêng ở đây]";

function taoForm() {
  var form = FormApp.create("Khảo sát: Tìm chỗ nghỉ khi chuyến bay bị chậm hoặc huỷ");
  form.setDescription(LOI_GIOI_THIEU)
      .setCollectEmail(false)
      .setLimitOneResponsePerUser(false)
      .setProgressBar(true)
      .setShowLinkToRespondAgain(false)
      .setConfirmationMessage("Cảm ơn anh/chị đã tham gia khảo sát!");
  try { form.setRequireLogin(false); } catch (e) {}

  // ---------- Trang đầu: đồng ý ----------
  var dongY = form.addMultipleChoiceItem()
    .setTitle("Xác nhận tham gia")
    .setRequired(true);

  // ---------- Phần S ----------
  var trangS1 = form.addPageBreakItem().setTitle("Phần S – Sàng lọc");
  var s1 = form.addMultipleChoiceItem()
    .setTitle("S1. Trong 24 tháng qua, anh/chị có đi máy bay (nội địa hoặc quốc tế) không?")
    .setRequired(true);

  var trangS2 = form.addPageBreakItem().setTitle("Phần S – Sàng lọc (tiếp)");
  var s2 = form.addMultipleChoiceItem()
    .setTitle("S2. Trong 24 tháng qua, anh/chị có từng gặp chuyến bay bị chậm từ 2 giờ trở lên hoặc bị huỷ không?")
    .setRequired(true);

  // ---------- Phần B ----------
  var trangB = form.addPageBreakItem()
    .setTitle("Phần B – Sự cố chậm/huỷ gần nhất")
    .setHelpText("Hãy nghĩ về lần bị chậm/huỷ GẦN NHẤT của anh/chị.");
  mc(form, "B1. Lần bị chậm/huỷ gần nhất đó là chuyến bay:", ["Nội địa", "Quốc tế"]);
  mc(form, "B2. Chuyến bay đó bị chậm khoảng bao lâu so với giờ dự kiến?",
     ["2–<4 giờ", "4–<6 giờ", "6–<12 giờ", "≥12 giờ", "Bị huỷ, bay chuyến khác hôm sau", "Bị huỷ, tôi không bay nữa"]);
  mc(form, "B3. Anh/chị nhận được thông báo chậm/huỷ vào khoảng thời gian nào?",
     ["Trước khi ra sân bay", "Đang trên đường ra sân bay", "Đã ở sân bay, trước giờ lên máy bay", "Sau khi đã lên máy bay"]);
  mc(form, "B4. Thời điểm đó rơi vào khung giờ nào?", ["7h–<18h", "18h–<22h", "22h–<24h", "0h–<7h"]);
  mc(form, "B5. Sự cố xảy ra tại sân bay nào?", ["Nội Bài", "Tân Sơn Nhất", "Đà Nẵng", "Cam Ranh", "Phú Quốc"], true);
  mc(form, "B6. Lúc đó anh/chị đang ở thành phố của mình hay ở nơi khác?",
     ["Thành phố nơi tôi sống", "Nơi khác (đi công tác, du lịch, quá cảnh)"]);
  cb(form, "B7. Anh/chị đi cùng ai?",
     ["Một mình", "Bạn bè, đồng nghiệp", "Gia đình có trẻ em dưới 12 tuổi", "Gia đình có người cao tuổi", "Người cần hỗ trợ đặc biệt"]);
  cb(form, "B8. Hãng hàng không đã hỗ trợ anh/chị những gì?",
     ["Nước uống", "Suất ăn hoặc voucher ăn", "Khách sạn hoặc chỗ nghỉ", "Xe đưa đón", "Bồi thường tiền", "Đổi chuyến miễn phí", "Không hỗ trợ gì", "Không nhớ"]);
  cb(form, "B9. Anh/chị biết thông tin về quyền lợi của mình (ăn, nghỉ, bồi thường) qua đâu?",
     ["Nhân viên hãng tại sân bay", "SMS, email của hãng", "App, website hãng", "Loa, bảng FIDS", "Người khác, mạng xã hội", "Tự tra cứu", "Không biết thông tin"]);

  var trangB10 = form.addPageBreakItem().setTitle("Phần B – Nhu cầu chỗ nghỉ");
  var b10 = form.addMultipleChoiceItem()
    .setTitle("B10. Trong tình huống đó, anh/chị CÓ CẦN tìm chỗ nghỉ/ngủ (khách sạn, phòng theo giờ, hộp ngủ…) không?")
    .setRequired(true);

  // ---------- Phần C ----------
  var trangC = form.addPageBreakItem().setTitle("Phần C – Khi cần tìm chỗ nghỉ");
  mc(form, "C1. Cuối cùng anh/chị nghỉ ở đâu?",
     ["Khách sạn do hãng bố trí", "Khách sạn tự đặt", "Phòng theo giờ, hộp ngủ tại sân bay", "Nhà người quen", "Ngủ lại ghế/sàn nhà ga"], true);
  cb(form, "C2. Anh/chị đã tìm chỗ nghỉ bằng cách nào?",
     ["Agoda", "Booking.com", "Traveloka", "Google Maps", "Gọi trực tiếp khách sạn", "Hỏi nhân viên sân bay, hãng", "Hỏi taxi, xe ôm", "Mạng xã hội", "Hãng bố trí, không phải tìm"]);
  mc(form, "C3. Từ lúc quyết định đi tìm đến khi có chỗ nghỉ mất bao lâu?",
     ["<15 phút", "15–<30 phút", "30–<60 phút", "≥60 phút", "Không tìm được"]);
  cb(form, "C4. Những khó khăn anh/chị gặp phải khi tìm chỗ nghỉ? (chọn tối đa 3)",
     ["Không biết giờ bay mới để quyết định", "Không biết hãng có lo chỗ nghỉ không", "Nơi gần sân bay hết phòng",
      "Không biết nơi nào còn nhận khách giữa đêm", "Giá quá cao", "Không rõ cách di chuyển, chi phí taxi",
      "Lo lỡ chuyến bay mới", "Mang nhiều hành lý, trẻ nhỏ", "Điện thoại sắp hết pin, mạng yếu", "Thanh toán khó (không có thẻ)"], true, 3);
  mc(form, "C5. Chi phí lưu trú anh/chị phải tự trả (VNĐ, không tính phần hãng chi)?",
     ["0", "<300.000", "300.000–<600.000", "600.000–<1.000.000", "≥1.000.000"]);
  mc(form, "C6a. Anh/chị di chuyển từ sân bay đến nơi nghỉ bằng gì?",
     ["Xe hãng bố trí", "Taxi", "Xe công nghệ", "Xe đưa đón khách sạn", "Đi bộ"]);
  mc(form, "C6b. Di chuyển từ sân bay đến nơi nghỉ mất bao lâu?", ["<10 phút", "10–<20 phút", "20–<40 phút", "≥40 phút"]);
  form.addScaleItem().setTitle("C7. Mức độ căng thẳng của anh/chị trong suốt quá trình tìm chỗ nghỉ?")
    .setBounds(1, 5).setLabels("Hoàn toàn bình tĩnh", "Rất căng thẳng").setRequired(true);
  form.addScaleItem().setTitle("C8. Mức độ hài lòng với nơi nghỉ cuối cùng?")
    .setBounds(1, 5).setLabels("Rất không hài lòng", "Rất hài lòng").setRequired(true);
  form.addParagraphTextItem().setTitle("C9. Điều gì khiến anh/chị chọn nơi nghỉ đó? (tuỳ chọn)");

  // ---------- Phần D ----------
  var trangD = form.addPageBreakItem().setTitle("Phần D – Khi không cần chỗ nghỉ");
  cb(form, "D1. Vì sao anh/chị không cần tìm chỗ nghỉ?",
     ["Thời gian chậm ngắn", "Tôi về nhà hoặc nhà người quen", "Hãng đã bố trí chỗ nghỉ",
      "Tôi chọn chờ tại sân bay (phòng chờ, ghế)", "Không muốn tốn tiền", "Sợ lỡ chuyến nếu rời sân bay"], true);
  cb(form, "D2. Trong thời gian chờ, anh/chị cần thông tin hoặc hỗ trợ gì nhất? (chọn tối đa 3)",
     ["Giờ bay mới chính xác", "Quyền lợi được hưởng", "Chỗ ngồi nghỉ, sạc điện thoại", "Đồ ăn uống",
      "Phòng chờ thương gia trả phí", "Đổi chuyến, hoàn vé"], true, 3);
  mc(form, "D3. GIẢ ĐỊNH chuyến bay bị dời sang 6 giờ sáng hôm sau, anh/chị sẽ làm gì?",
     ["Ở lại sân bay", "Tìm phòng theo giờ, hộp ngủ trong sân bay", "Tìm khách sạn gần sân bay",
      "Về nhà, nhà người quen", "Đợi hãng bố trí", "Chưa biết"]);

  // ---------- Phần E ----------
  var trangE = form.addPageBreakItem().setTitle("Phần E – Kịch bản giả định");
  mc(form, "E1. GIẢ ĐỊNH chuyến bay của anh/chị bị huỷ lúc 23h tại một thành phố không phải nơi anh/chị sống, chuyến thay thế lúc 7h sáng. Anh/chị sẽ làm gì đầu tiên?",
     ["Hỏi nhân viên hãng", "Mở app đặt phòng", "Tìm trên Google Maps", "Gọi người quen", "Ở lại sân bay"], true);

  // ---------- Phần F ----------
  var trangF = form.addPageBreakItem().setTitle("Phần F – Tiêu chí chọn nơi nghỉ và tính năng mong muốn");
  form.addGridItem()
    .setTitle("F1. Mức độ QUAN TRỌNG của các tiêu chí khi chọn nơi nghỉ khẩn cấp (1 = Không quan trọng … 5 = Rất quan trọng)")
    .setRows([
      "Khoảng cách/thời gian đến sân bay",
      "Giá phòng",
      "Nhận khách ngay/lễ tân 24h",
      "Có xe đưa đón sân bay",
      "Huỷ miễn phí nếu chuyến bay đổi giờ",
      "Thanh toán linh hoạt (tại chỗ, ví điện tử)",
      "Điểm đánh giá, ảnh thật",
      "An ninh, an toàn",
      "Phù hợp trẻ em/người cao tuổi",
      "Thuê theo giờ (3–6 giờ)",
      "Cập nhật giờ bay ngay trên trang",
      "Biết rõ hãng có chi trả không",
      "Hãy chọn mức 3 cho dòng này"   // câu kiểm tra chú ý – A06 loại phản hồi chọn khác 3
    ])
    .setColumns(["1", "2", "3", "4", "5"])
    .setRequired(true);
  cb(form, "F2. Nếu có một website giúp tìm chỗ nghỉ khi chuyến bay chậm/huỷ, anh/chị muốn có những tính năng nào? (chọn tối đa 5)",
     ["Nhập số hiệu chuyến bay để gợi ý tự động", "Danh sách nơi còn phòng ngay bây giờ gần sân bay",
      "Lọc theo thời gian di chuyển", "Giải thích quyền lợi theo quy định", "Đặt phòng theo giờ",
      "Gọi xe đến nơi nghỉ", "Nhắc giờ ra sân bay theo giờ bay mới", "Hướng dẫn chỗ nghỉ trong nhà ga",
      "Chat hỗ trợ 24/7", "Lưu chứng từ để xin hãng hoàn tiền"], true, 5);
  mc(form, "F3. Anh/chị sẽ dùng thiết bị nào trong tình huống đó?", ["Điện thoại", "Máy tính bảng", "Laptop"]);
  mc(form, "F4. Mức giá tối đa anh/chị chấp nhận cho một chỗ nghỉ khẩn cấp qua đêm (tự chi trả)?",
     ["<300.000", "300.000–<600.000", "600.000–<1.000.000", "≥1.000.000", "Tuỳ tình huống"]);
  form.addParagraphTextItem().setTitle("F5. Anh/chị mong muốn điều gì nhất từ một công cụ như vậy? (tuỳ chọn)");

  // ---------- Phần G ----------
  var trangG = form.addPageBreakItem().setTitle("Phần G – Thông tin chung");
  mc(form, "G1. Độ tuổi", ["18–24", "25–34", "35–44", "45–54", "≥55"]);
  mc(form, "G2. Số chuyến bay (lượt) trong 12 tháng qua", ["1–2", "3–5", "6–10", ">10"]);
  mc(form, "G3. Mục đích bay chủ yếu", ["Công việc", "Du lịch", "Thăm người thân", "Học tập"], true);
  mc(form, "G4. Nơi sinh sống hiện tại", ["Hà Nội", "TP.HCM", "Đà Nẵng", "Tỉnh, thành khác"]);
  mc(form, "G5. Anh/chị có sẵn sàng tham gia phỏng vấn 30–45 phút không? (nếu Có, vui lòng để lại email/SĐT ở form RIÊNG: " + LINK_FORM_LIEN_HE + ")",
     ["Có", "Không"]);

  // ---------- Điều hướng ----------
  trangC.setGoToPage(trangF);
  trangD.setGoToPage(trangF);
  trangE.setGoToPage(trangF);
  trangF.setGoToPage(trangG);

  dongY.setChoices([
    dongY.createChoice("Tôi từ 18 tuổi trở lên, đã đọc thông tin trên và ĐỒNG Ý tham gia.", trangS1),
    dongY.createChoice("Tôi KHÔNG đồng ý (kết thúc).", FormApp.PageNavigationType.SUBMIT)
  ]);
  s1.setChoices([
    s1.createChoice("Có", trangS2),
    s1.createChoice("Không", trangG)
  ]);
  s2.setChoices([
    s2.createChoice("Có, chậm ≥2 giờ", trangB),
    s2.createChoice("Có, bị huỷ", trangB),
    s2.createChoice("Có, cả hai", trangB),
    s2.createChoice("Chưa từng", trangE)
  ]);
  b10.setChoices([
    b10.createChoice("Có, và tôi đã có chỗ nghỉ", trangC),
    b10.createChoice("Có, nhưng không tìm được, phải ở lại sân bay", trangC),
    b10.createChoice("Không cần", trangD)
  ]);

  Logger.log("ĐÃ TẠO FORM.");
  Logger.log("Link chỉnh sửa : " + form.getEditUrl());
  Logger.log("Link gửi khảo sát: " + form.getPublishedUrl());
}

// Một lựa chọn (bắt buộc). khac=true → thêm ô "Khác".
function mc(form, tieuDe, phuongAn, khac) {
  var item = form.addMultipleChoiceItem().setTitle(tieuDe).setChoiceValues(phuongAn).setRequired(true);
  if (khac) item.showOtherOption(true);
  return item;
}

// Nhiều lựa chọn (bắt buộc). khac=true → thêm ô "Khác"; toiDa → giới hạn số lựa chọn.
function cb(form, tieuDe, phuongAn, khac, toiDa) {
  var item = form.addCheckboxItem().setTitle(tieuDe).setChoiceValues(phuongAn).setRequired(true);
  if (khac) item.showOtherOption(true);
  if (toiDa) {
    item.setValidation(FormApp.createCheckboxValidation()
      .setHelpText("Vui lòng chọn tối đa " + toiDa + " phương án.")
      .requireSelectAtMost(toiDa).build());
  }
  return item;
}
