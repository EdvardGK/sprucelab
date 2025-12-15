# Git Initialize and Commit Script for PowerShell
# Session 005: First Commit - IFC Validation Service and Model View Enhancements

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "GIT INITIALIZATION AND FIRST COMMIT - SESSION 005" -ForegroundColor Cyan
Write-Host "================================================================================`n" -ForegroundColor Cyan

# Check if .git already exists
if (Test-Path ".git") {
    Write-Host "Git repository already initialized!" -ForegroundColor Green
} else {
    Write-Host "STEP 1: Initializing git repository..." -ForegroundColor Yellow
    git init
    Write-Host "Git repository initialized!" -ForegroundColor Green
}

Write-Host "`n"
Read-Host "Press Enter to configure git (if not already done)"

# Configure git (if not already configured)
Write-Host "`nConfiguring git user..." -ForegroundColor Yellow
$userName = git config user.name
if (-not $userName) {
    Write-Host "Please enter your name for git commits:"
    $name = Read-Host "Name"
    git config user.name "$name"

    Write-Host "Please enter your email for git commits:"
    $email = Read-Host "Email"
    git config user.email "$email"

    Write-Host "Git configured!" -ForegroundColor Green
} else {
    Write-Host "Git already configured as: $userName" -ForegroundColor Green
}

Write-Host "`n"
Read-Host "Press Enter to check repository status"

# Step 2: Check status
Write-Host "`nSTEP 2: Checking repository status..." -ForegroundColor Yellow
git status

Write-Host "`n"
Read-Host "Press Enter to stage files for commit"

# Step 3: Stage all changes
Write-Host "`nSTEP 3: Staging files..." -ForegroundColor Yellow
git add .

Write-Host "All files staged!" -ForegroundColor Green
git status --short

Write-Host "`n"
Read-Host "Press Enter to create first commit"

# Step 4: Create commit
Write-Host "`nSTEP 4: Creating commit..." -ForegroundColor Yellow
git commit -F commit-message.txt

Write-Host "`nCommit created!" -ForegroundColor Green

# Step 5: Verify commit
Write-Host "`nSTEP 5: Verifying commit..." -ForegroundColor Yellow
git log -1 --oneline

Write-Host "`n"
Read-Host "Press Enter to connect to GitHub and push"

# Step 6: Connect to GitHub and push
Write-Host "`nSTEP 6: Connecting to GitHub..." -ForegroundColor Yellow

# Check if remote already exists
$remoteExists = git remote | Select-String -Pattern "origin"

if (-not $remoteExists) {
    Write-Host "Adding remote origin: https://github.com/EdvardGK/sprucelab.git" -ForegroundColor Yellow
    git remote add origin https://github.com/EdvardGK/sprucelab.git
    Write-Host "Remote added!" -ForegroundColor Green
} else {
    Write-Host "Remote origin already exists" -ForegroundColor Green
}

# Rename branch to main (if needed)
$currentBranch = git branch --show-current
if ($currentBranch -ne "main") {
    Write-Host "Renaming branch to 'main'..." -ForegroundColor Yellow
    git branch -M main
}

Write-Host "`nPushing to GitHub..." -ForegroundColor Yellow
git push -u origin main

Write-Host "`n================================================================================" -ForegroundColor Green
Write-Host "SUCCESS! FIRST COMMIT COMPLETE!" -ForegroundColor Green
Write-Host "================================================================================`n" -ForegroundColor Green
Write-Host "Repository: https://github.com/EdvardGK/sprucelab" -ForegroundColor Cyan
Write-Host "Commits:    https://github.com/EdvardGK/sprucelab/commits/main" -ForegroundColor Cyan
Write-Host "`n"
