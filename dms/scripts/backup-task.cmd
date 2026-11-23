@echo off
rem Used by Windows Task Scheduler for the nightly backup. Runs from the dms folder.
cd /d "%~dp0.."
node scripts\backup.js
