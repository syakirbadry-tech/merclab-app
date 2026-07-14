#!/bin/bash

# Merc Lab PWA - GitHub Pages Deploy Script
# This script automates the deployment to GitHub Pages

echo "🚀 Merc Lab GitHub Pages Deployment Script"
echo "==========================================="
echo ""

# Check if Git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first:"
    echo "   https://git-scm.com/download"
    exit 1
fi

# Get GitHub username
read -p "Enter your GitHub username: " GITHUB_USERNAME

if [ -z "$GITHUB_USERNAME" ]; then
    echo "❌ GitHub username cannot be empty!"
    exit 1
fi

# Get repository name (default: merclab-app)
read -p "Enter repository name (default: merclab-app): " REPO_NAME
REPO_NAME=${REPO_NAME:-merclab-app}

echo ""
echo "📋 Setup Summary:"
echo "   GitHub Username: $GITHUB_USERNAME"
echo "   Repository: $REPO_NAME"
echo "   URL will be: https://$GITHUB_USERNAME.github.io/$REPO_NAME"
echo ""

read -p "Is this correct? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled."
    exit 1
fi

echo ""
echo "✅ Initializing Git repository..."

# Initialize Git if not already done
if [ ! -d ".git" ]; then
    git init
    echo "   ✓ Git initialized"
else
    echo "   ℹ Git already initialized"
fi

echo ""
echo "📦 Adding all files..."
git add .
echo "   ✓ Files staged"

echo ""
echo "💾 Creating initial commit..."
git commit -m "Initial commit: Merc Lab PWA" --allow-empty
echo "   ✓ Commit created"

echo ""
echo "🔗 Connecting to GitHub..."
REPO_URL="https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"

# Remove existing remote if present
git remote remove origin 2>/dev/null

git remote add origin "$REPO_URL"
echo "   ✓ Remote added: $REPO_URL"

echo ""
echo "🌿 Setting up main branch..."
git branch -M main
echo "   ✓ Branch set to main"

echo ""
echo "⬆️  Pushing to GitHub..."
echo ""
echo "⚠️  NOTE: You'll be asked to authenticate with GitHub"
echo "   - Use your GitHub username and Personal Access Token"
echo "   - Or authenticate via browser when prompted"
echo ""

git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS! Your app has been deployed!"
    echo ""
    echo "📱 Your live URL:"
    echo "   https://$GITHUB_USERNAME.github.io/$REPO_NAME"
    echo ""
    echo "📖 Next steps:"
    echo "   1. Open the URL in your browser to test"
    echo "   2. Go to GitHub repo Settings → Pages to verify"
    echo "   3. On iPhone: Share → Add to Home Screen"
    echo "   4. Share the URL with others"
    echo ""
    echo "🚀 You're all set!"
else
    echo ""
    echo "❌ Push failed. Common issues:"
    echo "   - Check your GitHub username is correct"
    echo "   - Make sure the repository exists on GitHub"
    echo "   - Verify your GitHub authentication"
    echo ""
    echo "Manual push command:"
    echo "   git push -u origin main"
fi
