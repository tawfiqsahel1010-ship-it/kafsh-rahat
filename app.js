/* =========================================================
   کفش راحت
   سیستم حسابداری آفلاین
========================================================= */


/* =========================================================
   تنظیمات
========================================================= */

const DB_NAME = "KafshRahaatAccountingDB";
const DB_VERSION = 1;

const RESULTS_PER_PAGE = 100;


/* =========================================================
   متغیرهای اصلی
========================================================= */

let db = null;

let selectedDate = null;

let currentTransactionType = null;


/* =========================================================
   گرفتن تاریخ شمسی افغانستان
========================================================= */

function getPersianDate(date = new Date()) {

    const formatter = new Intl.DateTimeFormat(
        "en-US-u-ca-persian",
        {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone: "Asia/Kabul"
        }
    );

    const parts = formatter.formatToParts(date);

    let year = "";
    let month = "";
    let day = "";

    for (const part of parts) {

        if (part.type === "year") {
            year = part.value;
        }

        if (part.type === "month") {
            month = part.value;
        }

        if (part.type === "day") {
            day = part.value;
        }
    }

    return `${year}-${month}-${day}`;
}


/* =========================================================
   نمایش تاریخ
========================================================= */

function formatPersianDate(dateKey) {

    if (!dateKey) {
        return "---";
    }

    const parts = dateKey.split("-");

    if (parts.length !== 3) {
        return dateKey;
    }

    return `${parts[0]}/${parts[1]}/${parts[2]}`;
}


/* =========================================================
   باز کردن دیتابیس
========================================================= */

function openDatabase() {

    return new Promise((resolve, reject) => {

        const request = indexedDB.open(
            DB_NAME,
            DB_VERSION
        );


        request.onupgradeneeded = function(event) {

            const database = event.target.result;


            /* روزها */

            if (!database.objectStoreNames.contains("days")) {

                database.createObjectStore(
                    "days",
                    {
                        keyPath: "date"
                    }
                );
            }


            /* تراکنش‌ها */

            if (!database.objectStoreNames.contains("transactions")) {

                const transactionStore =
                    database.createObjectStore(
                        "transactions",
                        {
                            keyPath: "id",
                            autoIncrement: true
                        }
                    );

                transactionStore.createIndex(
                    "date",
                    "date",
                    {
                        unique: false
                    }
                );
            }
        };


        request.onsuccess = function(event) {

            db = event.target.result;

            resolve(db);
        };


        request.onerror = function() {

            reject(
                request.error
            );
        };

    });
}


/* =========================================================
   ذخیره روز
========================================================= */

function saveDay(day) {

    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                ["days"],
                "readwrite"
            );

        const store =
            transaction.objectStore("days");

        const request =
            store.put(day);

        request.onsuccess = () => resolve(true);

        request.onerror = () =>
            reject(request.error);

    });
}


/* =========================================================
   گرفتن روز
========================================================= */

function getDay(date) {

    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                ["days"],
                "readonly"
            );

        const store =
            transaction.objectStore("days");

        const request =
            store.get(date);

        request.onsuccess = () =>
            resolve(request.result || null);

        request.onerror = () =>
            reject(request.error);

    });
}


/* =========================================================
   گرفتن همه روزها
========================================================= */

function getAllDays() {

    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                ["days"],
                "readonly"
            );

        const store =
            transaction.objectStore("days");

        const request =
            store.getAll();

        request.onsuccess = () =>
            resolve(request.result || []);

        request.onerror = () =>
            reject(request.error);

    });
}


/* =========================================================
   پیدا کردن آخرین روز قبل
========================================================= */

async function getPreviousDayBalance(date) {

    const days =
        await getAllDays();

    const previousDays =
        days
            .filter(day => day.date < date)
            .sort(
                (a, b) =>
                    b.date.localeCompare(a.date)
            );


    if (previousDays.length === 0) {

        return 0;
    }


    return Number(
        previousDays[0].closingBalance || 0
    );
}


/* =========================================================
   ساخت روز در صورت نبودن
========================================================= */

async function createDayIfNeeded(date) {

    let day =
        await getDay(date);


    if (day) {

        return day;
    }


    const previousBalance =
        await getPreviousDayBalance(date);


    day = {

        date: date,

        openingBalance:
            previousBalance,

        closingBalance:
            previousBalance,

        sales: 0,

        expenses: 0,

        withdrawals: 0,

        netChange: 0,

        createdAt:
            new Date().toISOString()

    };


    await saveDay(day);


    return day;
}


/* =========================================================
   ذخیره تراکنش
========================================================= */

function saveTransaction(transactionData) {

    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                ["transactions"],
                "readwrite"
            );

        const store =
            transaction.objectStore(
                "transactions"
            );

        const request =
            store.add(transactionData);

        request.onsuccess = () =>
            resolve(request.result);

        request.onerror = () =>
            reject(request.error);

    });
}


/* =========================================================
   گرفتن تراکنش‌های یک روز
========================================================= */

function getTransactions(date) {

    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                ["transactions"],
                "readonly"
            );

        const store =
            transaction.objectStore(
                "transactions"
            );

        const index =
            store.index("date");

        const request =
            index.getAll(date);

        request.onsuccess = () =>
            resolve(request.result || []);

        request.onerror = () =>
            reject(request.error);

    });
}


/* =========================================================
   حذف تراکنش
========================================================= */

function deleteTransaction(id) {

    return new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                ["transactions"],
                "readwrite"
            );

        const store =
            transaction.objectStore(
                "transactions"
            );

        const request =
            store.delete(id);

        request.onsuccess = () =>
            resolve(true);

        request.onerror = () =>
            reject(request.error);

    });
}


/* =========================================================
   محاسبه حساب روز
========================================================= */

async function calculateDay(date) {

    const day =
        await createDayIfNeeded(date);

    const transactions =
        await getTransactions(date);


    let sales = 0;

    let expenses = 0;

    let withdrawals = 0;


    transactions.forEach(item => {

        const amount =
            Number(item.amount || 0);


        if (item.type === "sale") {

            sales += amount;
        }


        if (item.type === "expense") {

            expenses += amount;
        }


        if (item.type === "withdrawal") {

            withdrawals += amount;
        }

    });


    const opening =
        Number(day.openingBalance || 0);


    const netChange =
        sales -
        expenses -
        withdrawals;


    const closing =
        opening +
        netChange;


    const updatedDay = {

        ...day,

        sales: sales,

        expenses: expenses,

        withdrawals: withdrawals,

        netChange: netChange,

        closingBalance: closing,

        updatedAt:
            new Date().toISOString()

    };


    await saveDay(updatedDay);


    return {

        day: updatedDay,

        transactions: transactions

    };
}


/* =========================================================
   نمایش عدد
========================================================= */

function formatMoney(value) {

    const number =
        Number(value || 0);

    return number.toLocaleString(
        "en-US"
    );
}


/* =========================================================
   بروزرسانی رابط کاربری
========================================================= */

async function refreshUI() {

    if (!selectedDate) {
        return;
    }


    const result =
        await calculateDay(
            selectedDate
        );


    const day =
        result.day;


    document.getElementById(
        "selectedDate"
    ).textContent =
        formatPersianDate(
            selectedDate
        );


    document.getElementById(
        "openingBalance"
    ).textContent =
        formatMoney(
            day.openingBalance
        );


    document.getElementById(
        "closingBalance"
    ).textContent =
        formatMoney(
            day.closingBalance
        );


    document.getElementById(
        "salesTotal"
    ).textContent =
        formatMoney(
            day.sales
        );


    document.getElementById(
        "expensesTotal"
    ).textContent =
        formatMoney(
            day.expenses
        );


    document.getElementById(
        "withdrawalsTotal"
    ).textContent =
        formatMoney(
            day.withdrawals
        );


    document.getElementById(
        "netChange"
    ).textContent =
        formatMoney(
            day.netChange
        );


    document.getElementById(
        "openingInput"
    ).value =
        day.openingBalance;


    await renderTransactions();

    await renderDays();

}


/* =========================================================
   نمایش تراکنش‌ها
========================================================= */

async function renderTransactions() {

    const list =
        document.getElementById(
            "transactionsList"
        );


    const count =
        document.getElementById(
            "transactionCount"
        );


    const transactions =
        await getTransactions(
            selectedDate
        );


    count.textContent =
        transactions.length;


    if (transactions.length === 0) {

        list.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    📋
                </div>

                <strong>
                    هنوز تراکنشی ثبت نشده
                </strong>

                <p>
                    فروش، مصرف یا برداشت را ثبت کنید.
                </p>

            </div>

        `;

        return;
    }


    transactions.sort(
        (a, b) =>
            b.id - a.id
    );


    list.innerHTML =
        transactions
            .map(transaction => {

                let icon = "💰";

                let title = "فروش";

                let className =
                    "transaction-sale";


                if (
                    transaction.type ===
                    "expense"
                ) {

                    icon = "🧾";

                    title = "مصرف";

                    className =
                        "transaction-expense";
                }


                if (
                    transaction.type ===
                    "withdrawal"
                ) {

                    icon = "💸";

                    title = "برداشت";

                    className =
                        "transaction-withdrawal";
                }


                return `

                    <div
                        class="transaction ${className}"
                    >

                        <div class="transaction-icon">
                            ${icon}
                        </div>


                        <div class="transaction-info">

                            <strong>
                                ${escapeHTML(title)}
                            </strong>

                            <span>
                                ${escapeHTML(
                                    transaction.description ||
                                    "بدون توضیحات"
                                )}
                            </span>

                        </div>


                        <div class="transaction-amount">

                            ${formatMoney(
                                transaction.amount
                            )}
                            افغانی

                        </div>


                        <button
                            class="transaction-delete"
                            onclick="removeTransaction(${transaction.id})"
                        >
                            🗑️
                        </button>

                    </div>

                `;

            })
            .join("");

}


/* =========================================================
   حذف تراکنش از صفحه
========================================================= */

async function removeTransaction(id) {

    const confirmDelete =
        confirm(
            "آیا از حذف این تراکنش مطمئن هستید؟"
        );


    if (!confirmDelete) {
        return;
    }


    await deleteTransaction(id);


    await refreshUI();

}


/* =========================================================
   نمایش روزهای گذشته
========================================================= */

async function renderDays() {

    const list =
        document.getElementById(
            "daysList"
        );


    const days =
        await getAllDays();


    const sortedDays =
        days
            .sort(
                (a, b) =>
                    b.date.localeCompare(a.date)
            );


    if (sortedDays.length === 0) {

        list.innerHTML = `

            <div class="empty-state small-empty">

                <div class="empty-icon">
                    📅
                </div>

                <p>
                    هنوز سابقه‌ای وجود ندارد.
                </p>

            </div>

        `;

        return;
    }


    list.innerHTML =
        sortedDays
            .slice(
                0,
                RESULTS_PER_PAGE
            )
            .map(day => {

                return `

                    <div
                        class="day-item"
                        onclick="selectDay('${day.date}')"
                    >

                        <div>

                            <div class="day-date">
                                📅
                                ${formatPersianDate(
                                    day.date
                                )}
                            </div>

                            <small>
                                فروش:
                                ${formatMoney(day.sales)}
                                |
                                مصرف:
                                ${formatMoney(day.expenses)}
                            </small>

                        </div>


                        <div class="day-closing">

                            ${formatMoney(
                                day.closingBalance
                            )}

                            افغانی

                        </div>

                    </div>

                `;

            })
            .join("");

}


/* =========================================================
   انتخاب روز
========================================================= */

async function selectDay(date) {

    selectedDate = date;

    await createDayIfNeeded(
        selectedDate
    );

    await refreshUI();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


/* =========================================================
   امروز
========================================================= */

async function goToday() {

    selectedDate =
        getPersianDate();


    await createDayIfNeeded(
        selectedDate
    );


    await refreshUI();

}


/* =========================================================
   باز کردن پنجره ثبت
========================================================= */

function openModal(type) {

    currentTransactionType =
        type;


    const modal =
        document.getElementById(
            "modal"
        );


    const title =
        document.getElementById(
            "modalTitle"
        );


    const icon =
        document.getElementById(
            "modalIcon"
        );


    const amount =
        document.getElementById(
            "amountInput"
        );


    const description =
        document.getElementById(
            "descriptionInput"
        );


    amount.value = "";

    description.value = "";


    if (type === "sale") {

        title.textContent =
            "ثبت فروش";

        icon.textContent =
            "💰";
    }


    if (type === "expense") {

        title.textContent =
            "ثبت مصرف";

        icon.textContent =
            "🧾";
    }


    if (type === "withdrawal") {

        title.textContent =
            "ثبت برداشت";

        icon.textContent =
            "💸";
    }


    modal.classList.add(
        "show"
    );


    setTimeout(
        () => amount.focus(),
        100
    );

}


/* =========================================================
   بستن پنجره
========================================================= */

function closeModal() {

    document
        .getElementById("modal")
        .classList.remove("show");

    currentTransactionType =
        null;

}


/* =========================================================
   ذخیره تراکنش
========================================================= */

async function handleSaveTransaction() {

    const amountInput =
        document.getElementById(
            "amountInput"
        );


    const descriptionInput =
        document.getElementById(
            "descriptionInput"
        );


    const amount =
        Number(
            amountInput.value
        );


    const description =
        descriptionInput.value.trim();


    if (
        !amount ||
        amount <= 0
    ) {

        alert(
            "لطفاً مبلغ معتبر وارد کنید."
        );

        amountInput.focus();

        return;
    }


    if (!currentTransactionType) {

        return;
    }


    await saveTransaction({

        date:
            selectedDate,

        type:
            currentTransactionType,

        amount:
            amount,

        description:
            description,

        createdAt:
            new Date().toISOString()

    });


    closeModal();


    await refreshUI();

}


/* =========================================================
   ذخیره موجودی ابتدای روز
========================================================= */

async function saveOpeningBalance() {

    const input =
        document.getElementById(
            "openingInput"
        );


    const value =
        Number(
            input.value
        );


    if (
        value < 0 ||
        Number.isNaN(value)
    ) {

        alert(
            "مبلغ معتبر وارد کنید."
        );

        return;
    }


    const day =
        await createDayIfNeeded(
            selectedDate
        );


    day.openingBalance =
        value;


    await saveDay(day);


    await refreshUI();


    alert(
        "موجودی ابتدای روز ذخیره شد."
    );

}


/* =========================================================
   پشتیبان‌گیری
========================================================= */

async function exportBackup() {

    const days =
        await getAllDays();


    const transactions =
        await getAllTransactions();


    const backup = {

        app:
            "کفش راحت",

        version:
            1,

        exportedAt:
            new Date().toISOString(),

        days:
            days,

        transactions:
            transactions

    };


    const json =
        JSON.stringify(
            backup,
            null,
            2
        );


    const blob =
        new Blob(
            [json],
            {
                type:
                    "application/json"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    link.href = url;

    link.download =
        `پشتیبان-کفش-راحت-${selectedDate}.json`;


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    URL.revokeObjectURL(
        url
    );


    alert(
        "فایل پشتیبان آماده شد."
    );

}


/* =========================================================
   گرفتن همه تراکنش‌ها
========================================================= */

function getAllTransactions() {

    return new Promise(
        (resolve, reject) => {

            const transaction =
                db.transaction(
                    ["transactions"],
                    "readonly"
                );


            const store =
                transaction.objectStore(
                    "transactions"
                );


            const request =
                store.getAll();


            request.onsuccess =
                () =>
                    resolve(
                        request.result || []
                    );


            request.onerror =
                () =>
                    reject(
                        request.error
                    );

        }
    );

}


/* =========================================================
   بازیابی پشتیبان
========================================================= */

function importBackup() {

    document
        .getElementById(
            "importFile"
        )
        .click();

}


async function handleImportFile(event) {

    const file =
        event.target.files[0];


    if (!file) {
        return;
    }


    try {

        const text =
            await file.text();


        const backup =
            JSON.parse(text);


        if (
            !backup.days ||
            !backup.transactions
        ) {

            throw new Error(
                "فرمت فایل نادرست است."
            );

        }


        const confirmed =
            confirm(
                "اطلاعات پشتیبان وارد شود؟ اطلاعات فعلی حذف نمی‌شود."
            );


        if (!confirmed) {

            event.target.value = "";

            return;
        }


        for (
            const day
            of backup.days
        ) {

            await saveDay(day);
        }


        for (
            const item
            of backup.transactions
        ) {

            const transaction =
                db.transaction(
                    ["transactions"],
                    "readwrite"
                );


            const store =
                transaction.objectStore(
                    "transactions"
                );


            delete item.id;


            await new Promise(
                (resolve, reject) => {

                    const request =
                        store.add(item);


                    request.onsuccess =
                        () =>
                            resolve();


                    request.onerror =
                        () =>
                            reject(
                                request.error
                            );

                }
            );

        }


        await refreshUI();


        alert(
            "پشتیبان با موفقیت بازیابی شد."
        );


    } catch (error) {

        console.error(error);


        alert(
            "فایل پشتیبان معتبر نیست."
        );

    }


    event.target.value = "";

}


/* =========================================================
   حذف همه اطلاعات
========================================================= */

async function clearAllData() {

    const first =
        confirm(
            "آیا واقعاً می‌خواهید همه اطلاعات حذف شود؟"
        );


    if (!first) {
        return;
    }


    const second =
        confirm(
            "این کار قابل برگشت نیست. دوباره تأیید می‌کنید؟"
        );


    if (!second) {
        return;
    }


    await new Promise(
        (resolve, reject) => {

            const transaction =
                db.transaction(
                    [
                        "days",
                        "transactions"
                    ],
                    "readwrite"
                );


            transaction
                .objectStore("days")
                .clear();


            transaction
                .objectStore("transactions")
                .clear();


            transaction.oncomplete =
                () => resolve();


            transaction.onerror =
                () =>
                    reject(
                        transaction.error
                    );

        }
    );


    await goToday();


    alert(
        "همه اطلاعات حذف شد."
    );

}


/* =========================================================
   ساخت PDF
========================================================= */

async function createPDF() {

    const result =
        await calculateDay(
            selectedDate
        );


    const day =
        result.day;


    const transactions =
        result.transactions;


    const transactionRows =
        transactions.length > 0

            ? transactions
                .map(item => {

                    let type =
                        "فروش";


                    if (
                        item.type ===
                        "expense"
                    ) {

                        type =
                            "مصرف";
                    }


                    if (
                        item.type ===
                        "withdrawal"
                    ) {

                        type =
                            "برداشت";
                    }


                    return `

                        <tr>

                            <td>
                                ${escapeHTML(type)}
                            </td>

                            <td>
                                ${formatMoney(
                                    item.amount
                                )}
                                افغانی
                            </td>

                            <td>
                                ${escapeHTML(
                                    item.description ||
                                    "-"
                                )}
                            </td>

                        </tr>

                    `;

                })
                .join("")

            : `

                <tr>

                    <td colspan="3">
                        تراکنشی ثبت نشده است.
                    </td>

                </tr>

            `;


    const reportWindow =
        window.open(
            "",
            "_blank"
        );


    if (!reportWindow) {

        alert(
            "مرورگر اجازه باز شدن صفحه گزارش را نداد."
        );

        return;
    }


    reportWindow.document.write(`

        <!DOCTYPE html>

        <html lang="fa" dir="rtl">

        <head>

            <meta charset="UTF-8">

            <title>
                گزارش کفش راحت
            </title>

            <style>

                body {

                    font-family:
                        Tahoma,
                        Arial,
                        sans-serif;

                    background:
                        #f1f5f9;

                    margin: 0;

                    padding: 30px;

                    color: #0f172a;

                }


                .report {

                    max-width: 850px;

                    margin: auto;

                    background: white;

                    padding: 35px;

                    border-radius: 20px;

                }


                .head {

                    text-align: center;

                    padding-bottom: 25px;

                    border-bottom:
                        2px solid #e2e8f0;

                }


                .logo {

                    font-size: 50px;

                }


                h1 {

                    margin: 5px 0;

                    color: #1e3a8a;

                }


                .date {

                    color: #64748b;

                }


                .summary {

                    display: grid;

                    grid-template-columns:
                        repeat(2, 1fr);

                    gap: 12px;

                    margin-top: 25px;

                }


                .box {

                    padding: 18px;

                    border-radius: 14px;

                    background: #f8fafc;

                }


                .box span {

                    display: block;

                    color: #64748b;

                    font-size: 12px;

                }


                .box strong {

                    display: block;

                    margin-top: 5px;

                    font-size: 20px;

                }


                .closing {

                    background: #eff6ff;

                    color: #1d4ed8;

                }


                table {

                    width: 100%;

                    border-collapse:
                        collapse;

                    margin-top: 25px;

                }


                th,
                td {

                    border:
                        1px solid #e2e8f0;

                    padding: 10px;

                    text-align: right;

                    font-size: 12px;

                }


                th {

                    background: #0f172a;

                    color: white;

                }


                .footer {

                    text-align: center;

                    margin-top: 30px;

                    color: #64748b;

                    font-size: 11px;

                }


                @media print {

                    body {

                        padding: 0;

                        background: white;

                    }


                    .report {

                        box-shadow: none;

                    }

                }

            </style>

        </head>


        <body>

            <div class="report">

                <div class="head">

                    <div class="logo">
                        👟
                    </div>

                    <h1>
                        کفش راحت
                    </h1>

                    <div>
                        گزارش حسابداری
                    </div>

                    <div class="date">
                        تاریخ:
                        ${formatPersianDate(
                            selectedDate
                        )}
                    </div>

                </div>


                <div class="summary">

                    <div class="box">

                        <span>
                            موجودی ابتدای روز
                        </span>

                        <strong>
                            ${formatMoney(
                                day.openingBalance
                            )}
                            افغانی
                        </strong>

                    </div>


                    <div class="box">

                        <span>
                            مجموع فروش
                        </span>

                        <strong>
                            ${formatMoney(
                                day.sales
                            )}
                            افغانی
                        </strong>

                    </div>


                    <div class="box">

                        <span>
                            مجموع مصرف
                        </span>

                        <strong>
                            ${formatMoney(
                                day.expenses
                            )}
                            افغانی
                        </strong>

                    </div>


                    <div class="box">

                        <span>
                            مجموع برداشت
                        </span>

                        <strong>
                            ${formatMoney(
                                day.withdrawals
                            )}
                            افغانی
                        </strong>

                    </div>


                    <div class="box closing">

                        <span>
                            موجودی پایان روز
                        </span>

                        <strong>
                            ${formatMoney(
                                day.closingBalance
                            )}
                            افغانی
                        </strong>

                    </div>

                </div>


                <table>

                    <thead>

                        <tr>

                            <th>
                                نوع
                            </th>

                            <th>
                                مبلغ
                            </th>

                            <th>
                                توضیحات
                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        ${transactionRows}

                    </tbody>

                </table>


                <div class="footer">

                    کفش راحت
                    —
                    سیستم حسابداری آفلاین

                </div>

            </div>


            <script>

                window.onload = function() {

                    setTimeout(
                        function() {

                            window.print();

                        },
                        500
                    );

                };

            <\/script>

        </body>

        </html>

    `);


    reportWindow.document.close();

}


/* =========================================================
   ساخت تصویر گزارش
========================================================= */

async function saveReportImage() {

    const result =
        await calculateDay(
            selectedDate
        );


    const day =
        result.day;


    const canvas =
        document.createElement(
            "canvas"
        );


    const width = 1080;

    const height = 1350;


    canvas.width =
        width;

    canvas.height =
        height;


    const ctx =
        canvas.getContext(
            "2d"
        );


    /* پس‌زمینه */

    const gradient =
        ctx.createLinearGradient(
            0,
            0,
            width,
            height
        );


    gradient.addColorStop(
        0,
        "#0f172a"
    );


    gradient.addColorStop(
        0.55,
        "#1e3a8a"
    );


    gradient.addColorStop(
        1,
        "#2563eb"
    );


    ctx.fillStyle =
        gradient;


    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    /* کارت */

    ctx.fillStyle =
        "#ffffff";


    roundRect(
        ctx,
        60,
        60,
        960,
        1230,
        35
    );


    ctx.fill();


    /* لوگو */

    ctx.textAlign =
        "center";


    ctx.font =
        "80px Arial";


    ctx.fillStyle =
        "#0f172a";


    ctx.fillText(
        "👟",
        540,
        175
    );


    /* عنوان */

    ctx.font =
        "bold 52px Arial";


    ctx.fillStyle =
        "#1e3a8a";


    ctx.fillText(
        "کفش راحت",
        540,
        250
    );


    ctx.font =
        "30px Arial";


    ctx.fillStyle =
        "#64748b";


    ctx.fillText(
        "گزارش حسابداری",
        540,
        300
    );


    ctx.font =
        "27px Arial";


    ctx.fillText(
        "تاریخ: " +
        formatPersianDate(
            selectedDate
        ),
        540,
        355
    );


    /* خط */

    ctx.fillStyle =
        "#e2e8f0";


    ctx.fillRect(
        120,
        390,
        840,
        2
    );


    /* گزارش‌ها */

    drawReportBox(
        ctx,
        120,
        430,
        400,
        145,
        "موجودی ابتدای روز",
        formatMoney(
            day.openingBalance
        ) + " افغانی"
    );


    drawReportBox(
        ctx,
        560,
        430,
        400,
        145,
        "مجموع فروش",
        formatMoney(
            day.sales
        ) + " افغانی"
    );


    drawReportBox(
        ctx,
        120,
        600,
        400,
        145,
        "مجموع مصرف",
        formatMoney(
            day.expenses
        ) + " افغانی"
    );


    drawReportBox(
        ctx,
        560,
        600,
        400,
        145,
        "مجموع برداشت",
        formatMoney(
            day.withdrawals
        ) + " افغانی"
    );


    /* موجودی نهایی */

    ctx.fillStyle =
        "#eff6ff";


    roundRect(
        ctx,
        120,
        790,
        840,
        190,
        25
    );


    ctx.fill();


    ctx.fillStyle =
        "#64748b";


    ctx.font =
        "28px Arial";


    ctx.fillText(
        "موجودی پایان روز",
        540,
        850
    );


    ctx.fillStyle =
        "#1d4ed8";


    ctx.font =
        "bold 58px Arial";


    ctx.fillText(
        formatMoney(
            day.closingBalance
        ) + " افغانی",
        540,
        925
    );


    /* توضیح */

    ctx.fillStyle =
        "#64748b";


    ctx.font =
        "25px Arial";


    ctx.fillText(
        "گزارش مالی روز انتخاب‌شده",
        540,
        1050
    );


    ctx.fillStyle =
        "#0f172a";


    ctx.font =
        "bold 28px Arial";


    ctx.fillText(
        "کفش راحت",
        540,
        1140
    );


    ctx.font =
        "22px Arial";


    ctx.fillStyle =
        "#64748b";


    ctx.fillText(
        "سیستم حسابداری آفلاین",
        540,
        1180
    );


    /* تبدیل به تصویر */

    canvas.toBlob(
        function(blob) {

            if (!blob) {

                alert(
                    "ساخت تصویر انجام نشد."
                );

                return;
            }


            const url =
                URL.createObjectURL(
                    blob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                url;


            link.download =
                `گزارش-کفش-راحت-${selectedDate}.png`;


            document.body.appendChild(
                link
            );


            link.click();


            link.remove();


            setTimeout(
                () => {

                    URL.revokeObjectURL(
                        url
                    );

                },
                1000
            );


            alert(
                "تصویر گزارش آماده شد و در دانلودهای گوشی ذخیره می‌شود."
            );

        },
        "image/png"
    );

}


/* =========================================================
   کادر گزارش تصویر
========================================================= */

function drawReportBox(
    ctx,
    x,
    y,
    width,
    height,
    title,
    value
) {

    ctx.fillStyle =
        "#f8fafc";


    roundRect(
        ctx,
        x,
        y,
        width,
        height,
        22
    );


    ctx.fill();


    ctx.textAlign =
        "center";


    ctx.fillStyle =
        "#64748b";


    ctx.font =
        "25px Arial";


    ctx.fillText(
        title,
        x + width / 2,
        y + 52
    );


    ctx.fillStyle =
        "#0f172a";


    ctx.font =
        "bold 35px Arial";


    ctx.fillText(
        value,
        x + width / 2,
        y + 105
    );

}


/* =========================================================
   گوشه گرد Canvas
========================================================= */

function roundRect(
    ctx,
    x,
    y,
    width,
    height,
    radius
) {

    ctx.beginPath();

    ctx.moveTo(
        x + radius,
        y
    );

    ctx.lineTo(
        x + width - radius,
        y
    );

    ctx.quadraticCurveTo(
        x + width,
        y,
        x + width,
        y + radius
    );

    ctx.lineTo(
        x + width,
        y + height - radius
    );

    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - radius,
        y + height
    );

    ctx.lineTo(
        x + radius,
        y + height
    );

    ctx.quadraticCurveTo(
        x,
        y + height,
        x,
        y + height - radius
    );

    ctx.lineTo(
        x,
        y + radius
    );

    ctx.quadraticCurveTo(
        x,
        y,
        x + radius,
        y
    );

    ctx.closePath();

}


/* =========================================================
   جلوگیری از HTML Injection در توضیحات
========================================================= */

function escapeHTML(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   راه‌اندازی برنامه
========================================================= */

async function init() {

    try {

        await openDatabase();


        selectedDate =
            getPersianDate();


        await createDayIfNeeded(
            selectedDate
        );


        document.getElementById(
            "todayDate"
        ).textContent =
            formatPersianDate(
                selectedDate
            );


        await refreshUI();


    } catch (error) {

        console.error(error);


        alert(
            "خطا در راه‌اندازی حسابداری. صفحه را دوباره باز کنید."
        );

    }

}


/* =========================================================
   رویدادها
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function() {


        document
            .getElementById(
                "todayBtn"
            )
            .addEventListener(
                "click",
                goToday
            );


        document
            .getElementById(
                "addSaleBtn"
            )
            .addEventListener(
                "click",
                () =>
                    openModal("sale")
            );


        document
            .getElementById(
                "addExpenseBtn"
            )
            .addEventListener(
                "click",
                () =>
                    openModal("expense")
            );


        document
            .getElementById(
                "addWithdrawalBtn"
            )
            .addEventListener(
                "click",
                () =>
                    openModal("withdrawal")
            );


        document
            .getElementById(
                "closeModalBtn"
            )
            .addEventListener(
                "click",
                closeModal
            );


        document
            .getElementById(
                "saveTransactionBtn"
            )
            .addEventListener(
                "click",
                handleSaveTransaction
            );


        document
            .getElementById(
                "saveOpeningBtn"
            )
            .addEventListener(
                "click",
                saveOpeningBalance
            );


        document
            .getElementById(
                "exportBtn"
            )
            .addEventListener(
                "click",
                exportBackup
            );


        document
            .getElementById(
                "importBtn"
            )
            .addEventListener(
                "click",
                importBackup
            );


        document
            .getElementById(
                "importFile"
            )
            .addEventListener(
                "change",
                handleImportFile
            );


        document
            .getElementById(
                "clearBtn"
            )
            .addEventListener(
                "click",
                clearAllData
            );


        document
            .getElementById(
                "pdfBtn"
            )
            .addEventListener(
                "click",
                createPDF
            );


        document
            .getElementById(
                "imageBtn"
            )
            .addEventListener(
                "click",
                saveReportImage
            );


        document
            .getElementById(
                "modal"
            )
            .addEventListener(
                "click",
                function(event) {

                    if (
                        event.target ===
                        this
                    ) {

                        closeModal();

                    }

                }
            );


        document.addEventListener(
            "keydown",
            function(event) {

                if (
                    event.key ===
                    "Escape"
                ) {

                    closeModal();

                }


                if (
                    event.key ===
                    "Enter" &&
                    document
                        .getElementById(
                            "modal"
                        )
                        .classList
                        .contains("show")
                ) {

                    handleSaveTransaction();

                }

            }
        );


        init();

    }
);
