// =======================
// STEP 8 — Telegram send (FIXED)
// =======================
(function () {
    const TELEGRAM_API_URL = "https://mt-volpato.vercel.app/api/telegram";
    const TELEGRAM_FORM_SECRET = "mtx-volpato-2025";

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
            const cells = tds.map((td) => cleanText(td.textContent));
            if (cells.join("").length === 0) continue;
            lines.push(cells.join("; "));
        }
        return lines;
    }

    function guessTotalFromPage() {
        // 1) якщо є явний блок "Разом" (часто це текст типу "75 713 грн")
        const rootText = cleanText(document.body.textContent);
        const m = rootText.match(/([0-9][0-9\s]{2,})\s*грн/i);
        if (m && m[1]) return cleanText(m[1]) + " грн";

        // 2) fallback — з таблиць
        const tables = [
            document.getElementById("calcManagerTable"),
            document.getElementById("calcClientTable"),
        ].filter(Boolean);

        for (const t of tables) {
            const txt = cleanText(t.textContent);
            const mm = txt.match(/([0-9][0-9\s]{2,})\s*грн/i);
            if (mm && mm[1]) return cleanText(mm[1]) + " грн";
        }
        return "—";
    }

    async function sendToTelegramKC(opts = { force: false }) {
        // працюємо ТІЛЬКИ на Step 8
        if (getActiveStep() !== 8) return;

        // контакт
        const firstName = cleanText(document.getElementById("leadName")?.value);
        const lastName = cleanText(document.getElementById("leadSurname")?.value);
        const phoneRaw = cleanText(document.getElementById("leadPhone")?.value);
        const comment = cleanText(document.getElementById("leadComment")?.value);

        const phoneDigits = digitsOnly(phoneRaw);

        // перевірка — тільки по кліку (force=true)
        if (opts.force && phoneDigits.length < 10) {
            alert("Введіть коректний номер телефону (мінімум 10 цифр).");
            return;
        }

        // якщо не force — і телефону нема, просто тихо виходимо
        if (!opts.force && phoneDigits.length < 10) return;

        const modeLine = isManagerMode() ? "*менеджер*" : "*клієнт*";
        const totalLine = guessTotalFromPage();

        // таблиці
        const clientTable = document.getElementById("calcClientTable");
        const managerTable = document.getElementById("calcManagerTable");
        const lines = isManagerMode()
            ? tableToCsvLines(managerTable)
            : tableToCsvLines(clientTable);

        let text = "";
        text += "🧾 Нова заявка: Kitchen Configurator\n\n";
        text += `👤 ${firstName || "—"} ${lastName || ""}\n`;
        text += `📞 ${phoneRaw || "—"}\n`;
        if (comment) text += `💬 Коментар: ${comment}\n`;
        text += `\n🔁 Режим: ${modeLine}\n`;
        text += `\n💰 Орієнтовно: *${totalLine}*\n\n`;

        // text += "Дані з таблиці Step 8:\n";
        // text += "```\n";
        // if (lines.length) {
        //     text += lines.join("\n");
        // }
        // // else {
        // //     text += "(таблиця не знайдена або порожня)\n";
        // // }
        // text += "\n```";

        const payload = { secret: TELEGRAM_FORM_SECRET, text };

        const res = await fetch(TELEGRAM_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error("Помилка Telegram: " + res.status + " " + t);
        }
    }

    // 1) Клік по "Отримати прорахунок" (nextBtn) на Step 8 -> відправляємо
    document.addEventListener("click", (e) => {
        const btn = e.target?.closest?.("#nextBtn");
        if (!btn) return;
        if (getActiveStep() !== 8) return;

        // На Step 8 кнопка = "відправити", тому гасимо стандартну навігацію
        e.preventDefault();
        e.stopPropagation();

        sendToTelegramKC({ force: true })
            .then(() => alert("Заявку надіслано ✅"))
            .catch((err) => alert(err.message || String(err)));
    });

    // 2) Якщо у тебе є окрема кнопка sendToTelegramBtn — теж підтримуємо
    document.getElementById("sendToTelegramBtn")?.addEventListener("click", () => {
        sendToTelegramKC({ force: true })
            .then(() => alert("Заявку надіслано ✅"))
            .catch((err) => alert(err.message || String(err)));
    });
})();
