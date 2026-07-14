# 🚀 GitHub Pages Deployment - Complete Guide

## Step 1: Create GitHub Repository

1. Go to **github.com** and sign in (create account if needed)
2. Click **+** (top right) → **New repository**
3. Name it: `merclab-app`
4. Description: `Merc Lab Progressive Web App`
5. Select **Public** (required for free GitHub Pages)
6. Click **Create repository**

---

## Step 2: Get Your Files Ready

You have two options:

### Option A: Use Git Command Line (Faster)

**Prerequisites:**
- Git installed on your computer ([download](https://git-scm.com/))
- GitHub account created

**Steps:**

```bash
# 1. Create a folder for your project
mkdir merclab-app
cd merclab-app

# 2. Copy all these files into the folder:
# - index.html
# - manifest.json
# - service-worker.js
# - icons/ (entire folder)

# 3. Initialize Git and push to GitHub
git init
git add .
git commit -m "Initial commit: Merc Lab PWA"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/merclab-app.git
git push -u origin main
```

**Replace `YOUR-USERNAME`** with your actual GitHub username!

---

### Option B: Upload via Website (No Command Line Needed)

1. Go to your new repository on GitHub
2. Click **Add file** → **Upload files**
3. Drag & drop all files:
   - `index.html`
   - `manifest.json`
   - `service-worker.js`
   - `icons/` folder (with all PNG files)
4. Click **Commit changes**

---

## Step 3: Enable GitHub Pages

1. Go to your repository
2. Click **Settings** (top right)
3. Scroll to **Pages** (left sidebar)
4. Under "Source", select **Deploy from a branch**
5. Choose **main** branch
6. Click **Save**

**Wait 1-2 minutes** for GitHub to build your site.

---

## Step 4: Get Your Live URL

After GitHub finishes deploying:

1. Go back to **Settings → Pages**
2. You'll see: **Your site is live at:** `https://YOUR-USERNAME.github.io/merclab-app`

**Copy this URL!** 📋

---

## Step 5: Install on Your iPhone

1. Open **Safari** on your iPhone
2. Paste your URL in the address bar
3. Tap **Share** (↗️)
4. Tap **Add to Home Screen**
5. Tap **Add**

**Done!** 🎉 Your app is now on your home screen!

---

## Step 6: Share with Others

Send them your GitHub Pages URL:
```
https://YOUR-USERNAME.github.io/merclab-app
```

They can:
- View in browser
- Install on iPhone (Share → Add to Home Screen)
- Install on Android (Chrome shows install prompt)
- Install on Mac/Windows (Chrome → Install)

---

## 🔄 Update Your App

**If you need to update the app:**

### Via Command Line:
```bash
cd merclab-app
# Make your changes to files
git add .
git commit -m "Update: description of changes"
git push
```

### Via Website:
1. Go to your GitHub repo
2. Click file you want to update
3. Click ✏️ (edit icon)
4. Make changes
5. Click **Commit changes**

GitHub will automatically redeploy within 1-2 minutes!

---

## ✅ Checklist

- [ ] Created GitHub account
- [ ] Created `merclab-app` repository
- [ ] Uploaded all files (index.html, manifest.json, service-worker.js, icons/)
- [ ] Enabled GitHub Pages in Settings
- [ ] Got your live URL: `https://YOUR-USERNAME.github.io/merclab-app`
- [ ] Tested on iPhone (Share → Add to Home Screen)
- [ ] Shared URL with others

---

## 🐛 Troubleshooting

**"404 Not Found"**
- Wait 2-3 minutes for GitHub to deploy
- Refresh the page
- Check URL spelling (username and repo name)

**"App shows placeholder"**
- Your original HTML bundle isn't embedded yet
- Contact support to embed your app bundle

**"Icons not showing"**
- Make sure `icons/` folder is uploaded
- Check file names match (icon-192.png, etc.)
- Hard refresh: Cmd/Ctrl + Shift + R

**"Still not working?"**
- Check repository is PUBLIC (not private)
- Verify Settings → Pages shows "Your site is live at..."
- Try a different browser

---

## 💡 Pro Tips

- Your app URL never changes - share it confidently!
- GitHub Pages is free forever
- Works offline (thanks to Service Worker)
- Supports custom domain if you want (advanced)

---

## 🎉 You're Done!

Your Merc Lab app is now live on GitHub Pages and installable on any device!

**Next:** Share your URL and watch people install your app! 🚀
