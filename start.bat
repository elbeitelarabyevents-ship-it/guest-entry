@echo off
chcp 65001 >nul
title تشغيل Guest Entry

echo ===================================================
echo           جاري فحص بيئة التشغيل...
echo ===================================================

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [خطأ] Node.js غير مثبت على جهازك أو غير مضاف لـ PATH!
    echo يرجى تحميل وتثبيت Node.js (LTS) من الرابط التالي أولاً:
    echo https://nodejs.org
    echo.
    echo بعد التثبيت، أعد فتح هذا الملف.
    pause
    exit /b 1
)

echo [+] تم العثور على Node.js بنجاح!
echo [+] جاري تثبيت الحزم المطلوبة (npm install)...
call npm install

if not exist ".env" (
    echo [+] جاري إنشاء ملف الإعدادات .env...
    copy .env.example .env >nul
)

echo [+] جاري تهيئة قاعدة البيانات والحساب الافتراضي...
call npm run seed

echo.
echo ===================================================
echo [+] تم بدء تشغيل التطبيق بنجاح!
echo [+] افتح المتصفح على: http://localhost:3000
echo [+] الحساب الافتراضي: admin
echo [+] كلمة المرور: admin123
echo ===================================================
echo.

start http://localhost:3000
call npm start
pause
