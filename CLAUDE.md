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

### GitHub Actions auth

The workflow uses a `FIREBASE_TOKEN` secret (not a service account key). This token was generated via `npx firebase-tools login:ci` and stored in GitHub → repo → Settings → Secrets → Actions as `FIREBASE_TOKEN`. If the deploy ever breaks with an auth error, regenerate the token the same way and update the secret.

The old service account approach (`FIREBASE_SERVICE_ACCOUNT_LORELAI_BLUME_GALLERY`) was abandoned because Google's deprecated `oauth2/v4/token` endpoint stopped responding.

## Stack

- Static HTML/CSS/JS (no framework, no bundler)
- Firebase Firestore (database), Firebase Storage (media), Firebase Auth (Google sign-in)
- Owner email: lorelaiblume@gmail.com (only this account can enter edit mode)
