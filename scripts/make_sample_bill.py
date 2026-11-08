"""Draw a synthetic competitor telecom bill for the 'check against your bill' demo. All details are fictional."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1240, 1600
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)
font = lambda s, b=False: ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf" if b else "C:/Windows/Fonts/arial.ttf", s)
d.rectangle([0, 0, W, 150], fill="#1f3c88")
d.text((60, 45), "Competitor B Telecom", fill="white", font=font(54, True))
y = 210
for k, v in [("Bill for", "Business broadband and mobile"), ("Customer", "Shah Dental Care LLP"), ("Account no.", "CB-2207-55190"),
             ("Bill date", "01 Jul 2026"), ("Billing period", "01 Jun 2026 to 30 Jun 2026")]:
    d.text((60, y), k, fill="#555", font=font(30)); d.text((420, y), v, fill="#111", font=font(30)); y += 52
y += 40
d.line([60, y, W - 60, y], fill="#999", width=2); y += 30
for k, v in [("Home broadband 100 Mbps", "1,299.00"), ("Mobile postpaid x 3", "2,097.00"), ("Static IP add-on", "250.00"),
             ("Late fee", "422.00"), ("GST 18%", "732.00")]:
    d.text((60, y), k, fill="#111", font=font(34)); d.text((W - 300, y), v, fill="#111", font=font(34)); y += 62
d.line([60, y, W - 60, y], fill="#999", width=2); y += 36
d.text((60, y), "Total amount due", fill="#111", font=font(40, True)); d.text((W - 330, y), "Rs 4,800.00", fill="#111", font=font(40, True))
y += 120
d.text((60, y), "Pay by 15 Jul 2026. Support: 1800 000 0000 (fictional)", fill="#555", font=font(28))
out = Path(__file__).resolve().parents[1] / "backend" / "data" / "sample_bill.png"
img.save(out)
print("wrote", out)
