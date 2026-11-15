"""Creates the photos and bank CSV files the browser tests upload. Usage: python3 make_fixtures.py OUT_DIR (needs Pillow)."""
import random, sys, os
from PIL import Image, ImageDraw
out = os.path.join(sys.argv[1], 'fx'); os.makedirs(out, exist_ok=True)
random.seed(1)
im = Image.effect_noise((3000, 2000), 60).convert('RGB')            # a phone-sized photo (about 5 MB)
d = ImageDraw.Draw(im); d.rectangle([200, 200, 2800, 1800], outline=(255, 0, 0), width=20); d.text((300, 300), "RECEIPT TOTAL 23.45", fill=(255, 255, 255))
im.save(f"{out}/big.jpg", quality=95)
tr = Image.new('RGBA', (800, 600), (0, 0, 0, 0)); ImageDraw.Draw(tr).rectangle([0, 0, 400, 600], fill=(0, 0, 255, 255)); tr.save(f"{out}/transparent.png")
open(f"{out}/corrupt.jpg", "wb").write(b"this is not an image"); open(f"{out}/note.txt", "w").write("hello")
Image.new('RGB', (64, 48), (200, 50, 50)).save(f"{out}/small.jpg")
ing = '''"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"
"20260315";"Albert Heijn 1234 Amsterdam";"NL01INGB0001234567";"";"BA";"Af";"23,45";"Betaalautomaat";"Pasvolgnr: 012"
"20260316";"Salaris Werkgever BV";"NL01INGB0001234567";"NL02ABNA0123456789";"OV";"Bij";"2.500,00";"Overschrijving";"Salaris"
"20260317";"NS Groep IZ NS Reizigers";"NL01INGB0001234567";"";"BA";"Af";"7,60";"Betaalautomaat";""
"20260318";"Thuisbezorgd.nl";"NL01INGB0001234567";"";"ID";"Af";"1.024,00";"iDEAL";""
"20260319";"Kapot rij";"NL01INGB0001234567";"";"ID";"Af";"abc";"iDEAL";""
"20260320";"Bakkerij Kramer Utrecht 55";"NL01INGB0001234567";"";"BA";"Af";"4,20";"Betaalautomaat";""
"20260321";"Zoë Müller Utrecht";"NL01INGB0001234567";"";"BA";"Af";"7,50";"Betaalautomaat";""
'''
open(f"{out}/ing.csv", "w", encoding="cp1252").write(ing)                # Windows-1252, as many European banks export
open(f"{out}/big.csv", "w").write("Date,Description,Amount\n" + "\n".join(f"2026-03-{(i % 28) + 1:02d},Shop {i},-{1 + i % 9}.50" for i in range(450)))
open(f"{out}/card.csv", "w").write("Date,Description,Amount\n03/15/2026,AMAZON MKTPLACE,12.50\n03/16/2026,PAYMENT THANK YOU,-200.00\n03/17/2026,UBER TRIP,8.20\n03/20/2026,SHELL OIL,41.00\n")
open(f"{out}/empty.csv", "w").write(""); open(f"{out}/binary.csv", "wb").write(bytes(range(256)) * 20)
print("fixtures written to", out)
