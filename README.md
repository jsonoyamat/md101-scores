# MD 101 Score Portal

Score portal for **MD 101 – Mobile Application Development 1**, Pangasinan State University, Lingayen Campus.

Open the portal: **https://jsonoyamat.github.io/md101-scores/**

- Enter your **student number** and the **access code** your instructor gave you to see your own scores, your rank and percentile per assessment, and your standing so far.
- The **Class analytics** section is open to everyone and shows only anonymous figures: how many submitted, the average, the median and the score distribution.

## How your privacy is protected

This repository holds no names and no plain scores. Each student's record is encrypted (AES-256-GCM) with a key derived from the student number and the access code (PBKDF2-SHA256, 200 000 rounds). The page decrypts your record in your own browser; nothing is sent anywhere. Without the code, a record cannot be opened, and the code cannot be recovered from this site. If you lose your code, ask your instructor for a new one.
