// =======================
// STEP 8 — Telegram send
// =======================
(function () {
    const TELEGRAM_API_URL = "https://mt-volpato.vercel.app/api/telegram";
    const TELEGRAM_FORM_SECRET = "mtx-volpato-2025"; // той самий секрет як у MT Hub

    function getActiveStep() {
        const s = document.querySelector("section.step.active");
        return s ? Number(s.dataset.step || 0) : 0;
    }

    function isManagerMode() {
        const mv = document.getElementById("calcManagerView");
        if (!mv) return false;
        return getComputedStyle(mv).display !== "none";
    }

    function cleanText(s) {
        return String(s || "").replace(/\s+/g, " ").trim();
    }

    function digitsOnly(s) {
        return String(s || "").replace(/\D/g, "");
    }

    function tableToCsvLines(tableEl) {
        if (!tableEl) return [];
        const lines = [];
        const rows = Array.from(tableEl.querySelectorAll("tr"));
        for (const tr of rows) {
            const tds = Array.from(tr.querySelectorAll("th,td"));
            const cells = tds.map(td => cleanText(td.textContent));
            // пропускаємо повністю пусті рядки
            if (cells.join("").length === 0) continue;
            lines.push(cells.join("; "));
        }
        return lines;
    }

    function guessTotalFromTables() {
        // пробуємо витягнути "Разом" з таблиць
        const tables = [
            document.getElementById("calcManagerTable"),
            document.getElementById("calcClientTable"),
        ].filter(Boolean);

        for (const t of tables) {
            const txt = cleanText(t.textContent);
            // шукаємо останнє число з пробілами (типу 75 713) + "грн"
            const m = txt.match(/([0-9][0-9\s]{2,})\s*грн/i);
            if (m && m[1]) return cleanText(m[1]) + " грн";
        }
        return "—";
    }

    async function sendToTelegramKC() {
        // 1) перевірка, що ми реально на Step 8
        if (getActiveStep() !== 8) return;

        // 2) контакт
        const firstName = cleanText(document.getElementById("leadName")?.value);
        const lastName  = cleanText(document.getElementById("leadSurname")?.value);
        const phoneRaw  = cleanText(document.getElementById("leadPhone")?.value);
        const comment   = cleanText(document.getElementById("leadComment")?.value);

        // Витягуємо тільки цифри з телефону
        const phoneDigits = digitsOnly(phoneRaw);

        // Тут перевірка не буде показувати alert на перехід між кроками.
        // Лише після натискання на кнопку
        if (phoneDigits.length < 10) {
            alert("Введіть коректний номер телефону (мінімум 10 цифр).");
            return;
        }

        // Якщо все добре, формуємо текст та відправляємо
        const payload = {
            secret: TELEGRAM_FORM_SECRET,
            text: `
        📨 Нова заявка: Kitchen Configurator
        ${firstName} ${lastName}
        📞 Телефон: ${phoneRaw}
        Коментар: ${comment || "—"}
        `
        };

        // Надсилаємо дані через fetch
        const res = await fetch(TELEGRAM_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text();
            alert("Помилка відправки в Telegram: " + errorText);
        } else {
            alert("Заявка успішно відправлена в Telegram!");
        }
    }



    // Хук на кнопку "Отримати прорахунок" (у тебе це nextBtn на Step 8)
    // щоб не ламати інші кроки — працює ТІЛЬКИ коли активний step=8
    document.addEventListener("click", (e) => {
        const btn = e.target?.closest?.("#nextBtn");
        if (!btn) return;
        if (getActiveStep() !== 8) return;

        e.preventDefault();
        e.stopPropagation();

        sendToTelegramKC()
            .then(() => alert("Заявку надіслано ✅"))
            .catch((err) => alert(err?.message || String(err)));
    });
})();
