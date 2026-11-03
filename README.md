# MD 101 Score Portal

Score portal for **MD 101 – Mobile Application Development 1**, Pangasinan State University, Lingayen Campus.

Open the portal: **https://jsonoyamat.github.io/md101-scores/**

- Enter your **student number** and the **mobile number** registered in your student portal to see your own scores, rubric breakdowns, notes, rank and percentile, and your standing so far.
- The **Class analytics** section is open to everyone and shows only anonymous figures: how many submitted, the average, the median and the score distribution.

## How your privacy is protected

This site publishes no names, student numbers, mobile numbers or individual scores. The only data file here is `analytics.json`, which holds class-level counts, averages and histograms.

Individual records live in a private database behind a small server (`worker/`, a Cloudflare Worker with D1). When you unlock, the page sends your student number and mobile number to that server, which checks them and returns **only your own record**. The server stores an HMAC of each mobile number, never the number itself, and limits attempts: 8 per student number and 40 per network address every 15 minutes. If your number has changed, tell your instructor.

## For the instructor

See `worker/README.md` for setup and the update routine.
