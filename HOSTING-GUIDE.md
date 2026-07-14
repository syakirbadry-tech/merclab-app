# Merc Lab PWA - Hosting & Installation Guide

Your Merc Lab application is now a Progressive Web App (PWA) that can be installed on any device as a native-like app!

---

## 📋 What You Have

✅ **index.html** - PWA-optimized main app file  
✅ **manifest.json** - App metadata and configuration  
✅ **service-worker.js** - Offline support & caching  
✅ **icons/** - Complete icon set for all devices  

---

## 🚀 Quick Start: Install on Your iPhone

### Method 1: Add to Home Screen (iOS)
1. Open Safari on your iPhone
2. Visit your app URL
3. Tap the **Share** button (box with arrow)
4. Select **Add to Home Screen**
5. Customize the name (or keep "Merc Lab")
6. Tap **Add**

**Result:** App appears on home screen like a native app!

---

## 🌐 Hosting Options

### Option 1: **GitHub Pages** (FREE & Easy)
**Best for:** Quick deployment, no setup required

**Steps:**
1. Create a GitHub account (if you don't have one)
2. Create a new repository named `merclab-app`
3. Upload all files to the repository:
   - `index.html`
   - `manifest.json`
   - `service-worker.js`
   - `icons/` folder
4. Go to **Settings → Pages**
5. Enable "GitHub Pages" from main branch
6. Your app will be live at: `https://your-username.github.io/merclab-app`

**Share this URL** with your iPhone/iPad/other devices!

---

### Option 2: **Netlify** (FREE & Powerful)
**Best for:** Automatic deployments, custom domain

**Steps:**
1. Go to [netlify.com](https://netlify.com)
2. Sign up (free)
3. Create a new site from Git (connect GitHub) OR drag & drop your files
4. Deploy!
5. Your app gets a free domain: `your-app-name.netlify.app`

---

### Option 3: **Vercel** (FREE & Fast)
**Best for:** Best performance, automatic deployment

**Steps:**
1. Go to [vercel.com](https://vercel.com)
2. Sign up (free)
3. Import your repository OR drag & drop files
4. Deploy!
5. Your app gets: `your-app-name.vercel.app`

---

### Option 4: **Self-Hosted** (Your own server)
**Requirements:**
- Web hosting with HTTPS support (must be HTTPS for PWA!)
- Upload all files to your server

**Important:** PWAs require HTTPS. If your hosting doesn't support it, use one of the options above.

---

## 📱 Install on Your Devices

### iPhone / iPad
1. Open Safari
2. Go to your app URL
3. Share → **Add to Home Screen**
4. Launch from home screen (works offline!)

### Android Phone
1. Open Chrome / Firefox
2. Go to your app URL
3. Browser will show **Install** prompt automatically
4. Or: Menu (⋮) → **Install app**
5. Launch from home screen

### Mac / Windows
1. Open Chrome / Edge
2. Go to your app URL
3. Click the **Install** button (address bar)
4. App opens in its own window
5. Fully offline-capable!

---

## ✨ Features Included

🔄 **Offline Support** - Works without internet (thanks to Service Worker)  
📲 **App-like Experience** - Full screen, no browser chrome  
💾 **Caching** - Fast loading, smart resource management  
🎨 **Custom Icon** - Professional Merc Lab branding  
🔄 **Auto-Updates** - Service Worker checks for updates  
⚡ **Installable** - One-click install on any device  

---

## 🎨 Customizing the Logo/Icon

The current icons use a blue hexagon with "ML" text. To replace with your custom logo:

1. Send me your logo image
2. I'll regenerate all icon sizes (72px to 512px)
3. Replace the `icons/` folder with updated versions
4. Re-deploy to your hosting

**Supported formats:** PNG, JPG, SVG (I'll convert to all sizes needed)

---

## 🔧 Technical Details

### Files Structure
```
merc-lab-app/
├── index.html              # Main app (PWA-enabled)
├── manifest.json           # App configuration
├── service-worker.js       # Offline functionality
└── icons/                  # App icons
    ├── icon-192.png
    ├── icon-512.png
    ├── apple-touch-icon.png
    └── ... (other sizes)
```

### What Makes It a PWA?

✅ **manifest.json** - Tells devices how to install the app  
✅ **Service Worker** - Enables offline functionality  
✅ **HTTPS** - Secure connection (required)  
✅ **Responsive** - Works on all screen sizes  
✅ **Mobile Optimized** - Touch-friendly, fast loading  

---

## 🐛 Troubleshooting

### "Install button doesn't appear"
- Make sure you're using HTTPS
- Wait 10-30 seconds for Service Worker to register
- Try on Chrome/Firefox (better PWA support)

### "App crashes after installation"
- Clear app cache: Settings → Storage → Clear cache
- Reinstall the app
- Check browser console (F12) for errors

### "Offline doesn't work"
- Service Worker needs to be registered first
- Load the app online once, then try offline
- Check in DevTools → Application → Service Workers

### "Wrong logo/icon showing"
- Hard refresh: Cmd/Ctrl + Shift + R
- Clear browser cache
- Reinstall the app on your home screen

---

## 📤 Next Steps

1. **Choose hosting** (GitHub Pages is easiest)
2. **Deploy your app** (upload files)
3. **Install on devices** (Share → Add to Home Screen on iOS)
4. **Test offline** (turn off wifi/data and use the app)
5. **Share the URL** with others who want the app

---

## 💡 Pro Tips

- **Bookmark the URL** on all your devices
- **Use offline mode** to test Service Worker functionality
- **Check "Add to home screen"** after each update
- **Share the direct link** - recipients can install independently

---

## 📞 Support

If you encounter any issues:
1. Check this guide's Troubleshooting section
2. Open DevTools (F12) → Console for error messages
3. Ensure HTTPS is enabled on your hosting
4. Try a different browser (Chrome works best for PWA)

---

## 🎉 You're All Set!

Your Merc Lab PWA is ready for deployment. Choose your hosting platform, upload the files, and share the link with anyone who needs the app.

They can install it on any device—iPhone, Android, Mac, Windows—without going through an app store!

**Happy deploying! 🚀**
