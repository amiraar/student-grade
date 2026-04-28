# Student Grade (OMR)

Simple web app to grade exam answer sheets using OMR directly in the browser. Supports photo upload or camera capture, auto-crop + deskew, and manual 4-point calibration.

## Features
- Offline OMR in the browser (no API)
- Auto-crop + deskew for tilted photos
- Manual 4-point calibration
- Downloadable OMR template
- Low-contrast detection

## Usage
1. Open `index.html` in a browser.
2. Click **Download OMR Template** and print it.
3. Fill the answer sheet based on the template format.
4. Upload a photo or capture from camera.
5. Run **Auto-crop + Deskew** or **4-Point Calibration**.
6. Fill the answer key, then click **Grade Now**.

## Answer Sheet Format
- Multiple Choice: 15 questions, options A-D (3 blocks x 5 questions)
- True/False: 5 questions (B/S)
- Matching: 5 questions, options A-K

## OMR Layout Tuning
If bubbles do not align, adjust `getOmrLayout()` in `index.html`:
- `startX`, `startY`: starting position (ratio to width/height)
- `rowGap`, `colGap`: row/column spacing
- `blocks`: split a section into multiple blocks

## Deploy to Vercel (Recommended)
1. Push the repo to GitHub.
2. Vercel: **New Project** -> **Import** the repo.
3. Framework: **Other**. Leave Build Command and Output Directory empty.
4. Deploy.

## Notes
- Photos should be straight, full page visible, with even lighting.
- If results are inaccurate, use 4-point calibration.