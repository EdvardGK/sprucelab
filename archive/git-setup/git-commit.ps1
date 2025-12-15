# Git Commit Script for PowerShell
# Session 005: IFC Validation Service and Model View Enhancements

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "GIT COMMIT - SESSION 005" -ForegroundColor Cyan
Write-Host "================================================================================`n" -ForegroundColor Cyan

# Step 1: Check status
Write-Host "STEP 1: Checking git status..." -ForegroundColor Yellow
git status

Write-Host "`n"
Read-Host "Press Enter to continue with staging files"

# Step 2: Stage all changes
Write-Host "`nSTEP 2: Staging files..." -ForegroundColor Yellow
git add backend/
git add frontend/
git add SETUP.txt
git add project-management/
git add commit-message.txt
git add GIT_COMMIT_COMMANDS.txt
git add git-commit.ps1

Write-Host "Files staged!" -ForegroundColor Green
git status

Write-Host "`n"
Read-Host "Press Enter to create commit"

# Step 3: Create commit
Write-Host "`nSTEP 3: Creating commit..." -ForegroundColor Yellow
git commit -F commit-message.txt

Write-Host "`nCommit created!" -ForegroundColor Green

# Step 4: Verify commit
Write-Host "`nSTEP 4: Verifying commit..." -ForegroundColor Yellow
git log -1 --oneline

Write-Host "`n"
Read-Host "Press Enter to push to GitHub"

# Step 5: Push to GitHub
Write-Host "`nSTEP 5: Pushing to GitHub..." -ForegroundColor Yellow

# Check if remote exists
$remoteExists = git remote | Select-String -Pattern "origin"

if (-not $remoteExists) {
    Write-Host "Adding remote origin..." -ForegroundColor Yellow
    git remote add origin https://github.com/EdvardGK/sprucelab.git
    git branch -M main
    git push -u origin main
} else {
    git push
}

Write-Host "`n================================================================================" -ForegroundColor Green
Write-Host "COMMIT COMPLETE!" -ForegroundColor Green
Write-Host "================================================================================`n" -ForegroundColor Green
Write-Host "View at: https://github.com/EdvardGK/sprucelab/commits/main" -ForegroundColor Cyan
