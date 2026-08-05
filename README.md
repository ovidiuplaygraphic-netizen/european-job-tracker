# European Opportunity Radar

A browser-based European job discovery and application tracker tailored to Ovidiu Eftimie's profile.

## What it does

- Refreshes public listings from Jobicy and Arbeitnow every Monday at 09:00 Europe/Bucharest.
- Scores senior motion, creative leadership, experiential, audiovisual, broadcast, VFX, AI-motion and technical-visualisation roles.
- Removes junior, internship, trainee and student roles.
- Keeps French-desirable roles visible while marking mandatory B2/C1 French as a hard gap.
- Treats UK roles as a hard gap unless sponsorship or work-rights language is explicit.
- Stores application statuses, notes, manual roles and feed edits in the browser's local storage.
- Exports the full tracker as JSON or CSV.

The scoring is deterministic keyword triage, not an employment recommendation. Always review the original listing.

## Publish it on GitHub Pages

1. Extract the supplied ZIP on your computer.
2. In the `european-job-tracker` repository, choose **Add file → Upload files**.
3. Drag the *contents* of the extracted folder into the upload area. The repository root must show `README.md`, `site`, `scripts`, and `.github`.
4. Enter `Install European Opportunity Radar` as the commit message and choose **Commit changes**.
5. Open **Settings → Pages**.
6. Under **Build and deployment**, set **Source** to **GitHub Actions**.
7. Open the **Actions** tab, select **Refresh jobs and publish tracker**, and choose **Run workflow → Run workflow**.
8. When both workflow jobs are green, return to **Settings → Pages** to find the public address. It should be:
   `https://ovidiuplaygraphic-netizen.github.io/european-job-tracker/`

If GitHub does not preserve the `.github` folder during browser upload, upload `.github/workflows/publish.yml` separately using **Add file → Create new file**, naming the file exactly `.github/workflows/publish.yml`.

## Privacy

The GitHub repository and `site/jobs.json` are public. Do not place a CV, contact details, private notes or exported tracker files in the repository.

Application statuses and notes are saved only in the current browser. Export JSON before clearing browser storage, using another browser or moving devices. Import the JSON on the new device to restore the tracker.

## Run locally

From the extracted folder:

```bash
python3 -m http.server 8000 --directory site
```

Then visit `http://localhost:8000`. Opening `index.html` directly may block the JSON feed in some browsers, so use a small local web server.

## Change the schedule

Edit `.github/workflows/publish.yml`. The default schedule uses the `Europe/Bucharest` timezone and runs at 09:00 every Monday.

## Public feed attribution

- Jobicy: <https://jobicy.com/jobs-rss-feed>
- Arbeitnow: <https://www.arbeitnow.com/api/job-board-api>

The source links in each card lead to the listing supplied by the feed. Verify employer, location, salary, language and application deadline before acting.
