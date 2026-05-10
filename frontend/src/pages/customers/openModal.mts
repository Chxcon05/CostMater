import { data, countrySelect } from "./index.astro.0.mjs";

export function openModal(id = null) {
const modal = document.getElementById("modal");
const btnNew = document.getElementById("btn-new");
const form = document.getElementById("form");
const recordId = document.getElementById("record-id");
const modalTitle = document.getElementById("modal-title");

if (modal) modal.classList.remove("hidden");
if (btnNew) btnNew.classList.add("hidden");
if (form) form.reset();
if (recordId) recordId.value = "";
if (modalTitle) modalTitle.textContent = "Nuevo Cliente";

if (id) {
const r = data.find((d) => d.id === id);
if (r) {
if (recordId) recordId.value = r.id;
[
"name",
"email",
"phone",
"address",
"city",
"state",
"postal_code",
"credit_limit",
"payment_days",
"notes",
"country",
].forEach((f) => {
const field = document.getElementById(f);
if (field) field.value = r[f] || "";
});
if (r.country && countrySelect) {
countrySelect.dispatchEvent(new Event("change"));
}
if (modalTitle) modalTitle.textContent = "Editar Cliente";
}
}
}
