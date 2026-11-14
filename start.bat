@echo off
cd /d "%~dp0"
echo Clauset // Starting Local-First Agent Memory Mesh...
node scripts\launch.mjs --dev %*
