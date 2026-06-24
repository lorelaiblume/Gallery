# lorelaiblume — project context for Claude

## Deployment

Push to `main` → GitHub Actions deploys automatically to Firebase Hosting → **lorelaiblume.com**

Workflow file: `.github/workflows/firebase-hosting-merge.yml`  
Firebase project: `lorelai-blume-gallery`

The bash sandbox cannot reach GitHub (network restriction), so `git push` must be run by Lorelai in a local terminal:

```
cd ~/Desktop/dev/lorelaiblume && git push origin main
```

Deploy takes ~30–60 seconds after push. No build step — static files are served directly.

## Stack

- Static HTML/CSS/JS (no framework, no bundler)
- Firebase Firestore (database), Firebase Storage (media), Firebase Auth (Google sign-in)
- Owner email: lorelaiblume@gmail.com (only this account can enter edit mode)
