// ====== CONFIG ======
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxIESU-4yW37EeV3NVVsQreENrMuFgyjGAEy7KNJ4pJ3FN8yKPineWFhuJRlHtCFBGV/exec"; // Apps Script Web App URL

// ====== STATE ======
const state = {
  token: localStorage.getItem("nt_token") || "",
  rol: localStorage.getItem("nt_rol") || "",
  nombre: localStorage.getItem("nt_nombre") || "",
  grupos: [],
  roster: [],
};

// ====== OFFLINE QUEUE ======
const QKEY = "nt_queue_v1";
function loadQueue(){ return JSON.parse(localStorage.getItem(QKEY) || "[]"); }
function saveQueue(q){ localStorage.setItem(QKEY, JSON.stringify(q)); }
function enqueue(item){ const q=loadQueue(); q.push(item); saveQueue(q); }

// ====== HELPERS ======
const $ = (id)=>document.getElementById(id);
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function setMsg(id, text, isErr=false){
  const el = $(id);
  el.textContent = text || "";
  el.className = "msg" + (isErr ? " error" : "");
}

function isOnline(){ return navigator.onLine; }
function updateNetBadge(){
  const b = $("netBadge");
  b.textContent = isOnline() ? "Online" : "Offline";
}
window.addEventListener("online", updateNetBadge);
window.addEventListener("offline", updateNetBadge);

async function apiGet(action, params={}){
  const url = new URL(WEB_APP_URL);
  url.searchParams.set("action", action);
  if (state.token) url.searchParams.set("token", state.token);
  Object.entries(params).forEach(([k,v])=> url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "GET" });
  return res.json();
}
async function apiPost(action, body={}){
  const payload = { action, token: state.token, ...body };
  const res = await fetch(WEB_APP_URL, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

function setSession(token, rol, nombre){
  state.token = token; state.rol = rol; state.nombre = nombre;
  localStorage.setItem("nt_token", token);
  localStorage.setItem("nt_rol", rol);
  localStorage.setItem("nt_nombre", nombre);
}

function clearSession(){
  state.token=""; state.rol=""; state.nombre="";
  localStorage.removeItem("nt_token");
  localStorage.removeItem("nt_rol");
  localStorage.removeItem("nt_nombre");
}

// ====== UI NAV ======
function go(view){
  hide($("viewLogin"));
  hide($("viewDash"));
  hide($("viewGrupos"));
  hide($("viewAsistencia"));
  hide($("viewAdmin"));
  hide($("viewReportes"));

  if (view === "login") show($("viewLogin"));
  if (view === "dash") show($("viewDash"));
  if (view === "grupos") show($("viewGrupos"));
  if (view === "asistencia") show($("viewAsistencia"));
  if (view === "admin") show($("viewAdmin"));
  if (view === "reportes") show($("viewReportes"));
}

function bindBackButtons(){
  document.querySelectorAll("[data-back]").forEach(btn=>{
    btn.addEventListener("click", ()=>go("dash"));
  });
}

// ====== RENDER ======
function fillSelect(el, items, getLabel, getValue){
  el.innerHTML = "";
  items.forEach(it=>{
    const opt = document.createElement("option");
    opt.value = getValue(it);
    opt.textContent = getLabel(it);
    el.appendChild(opt);
  });
}

function renderTable(containerId, headers, rows){
  const div = $(containerId);
  if (!rows || rows.length === 0){
    div.innerHTML = "<div class='muted' style='padding:10px'>Sin datos.</div>";
    return;
  }
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  headers.forEach(h=>{
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(r=>{
    const tr = document.createElement("tr");
    headers.forEach(h=>{
      const td = document.createElement("td");
      td.textContent = r[h] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  div.innerHTML = "";
  div.appendChild(table);
}

// ====== DATA LOAD ======
async function loadResumen(){
  const res = await apiGet("getResumen");
  if (!res.ok) return;
  $("resumen").textContent = `Usuario: ${res.nombre} (${res.rol}) | Alumnos: ${res.counts.alumnos} | Grupos: ${res.counts.grupos} | Inscripciones: ${res.counts.inscripciones} | Pagos: ${res.counts.pagos}`;
}

async function loadGrupos(){
  const res = await apiGet("listGrupos");
  if (!res.ok) return res;
  state.grupos = res.grupos || [];
  return res;
}

function grupoLabel(g){
  return `${g.clave_grupo} (${g.periodo || ""}) - ${g.clave_curso}`;
}

// ====== LOGIN ======
async function login(){
  setMsg("loginMsg","");
  const pin = $("pin").value.trim();
  if (!pin) return setMsg("loginMsg","Escribe tu PIN.", true);

  try{
    const url = new URL(WEB_APP_URL);
    url.searchParams.set("action","login");
    url.searchParams.set("pin", pin);
    const res = await fetch(url.toString(), { method:"GET" }).then(r=>r.json());

    if (!res.ok) return setMsg("loginMsg", res.error || "No se pudo iniciar sesión", true);

    setSession(res.token, res.rol, res.nombre);

    // UI role
    if (state.rol === "ADMIN") show($("tileAdmin"));
    else hide($("tileAdmin"));

    await loadGrupos();
    await loadResumen();
    await hydrateSelects();
    go("dash");
  } catch(e){
    setMsg("loginMsg", String(e), true);
  }
}

// ====== SELECTS ======
async function hydrateSelects(){
  // Grupos selects
  fillSelect($("selGrupo"), state.grupos, grupoLabel, g=>g.clave_grupo);
  fillSelect($("selGrupoA"), state.grupos, grupoLabel, g=>g.clave_grupo);

  // Fecha default hoy
  const d = new Date();
  const yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0");
  $("fechaClase").value = `${yyyy}-${mm}-${dd}`;
}

// ====== GRUPOS VIEW ======
async function cargarRoster(){
  const clave = $("selGrupo").value;
  const res = await apiGet("getRoster", { clave_grupo: clave });
  if (!res.ok) {
    $("roster").innerHTML = `<div class='muted' style='padding:10px'>${res.error || "Error"}</div>`;
    return;
  }
  const rows = res.roster.map(x=>({
    "ID Inscripción": x.id_inscripcion,
    "Clave": x.clave_alumno,
    "Apellidos": x.apellidos,
    "Nombres": x.nombres,
    "Estatus": x.estatus
  }));
  renderTable("roster", ["ID Inscripción","Clave","Apellidos","Nombres","Estatus"], rows);
}

// ====== ASISTENCIA VIEW ======
let asistenciaDraft = []; // {id_inscripcion, clave_alumno, apellidos, nombres, presente, nota}

async function cargarAsistencia(){
  setMsg("asistMsg","");
  const clave = $("selGrupoA").value;
  const res = await apiGet("getRoster", { clave_grupo: clave });
  if (!res.ok) {
    $("asistenciaLista").innerHTML = `<div class='muted' style='padding:10px'>${res.error || "Error"}</div>`;
    return;
  }
  asistenciaDraft = res.roster.map(x=>({
    id_inscripcion: x.id_inscripcion,
    clave_alumno: x.clave_alumno,
    apellidos: x.apellidos,
    nombres: x.nombres,
    presente: true,
    nota: ""
  }));
  renderAsistenciaEditable();
}

function renderAsistenciaEditable(){
  const div = $("asistenciaLista");
  if (asistenciaDraft.length === 0){
    div.innerHTML = "<div class='muted' style='padding:10px'>Sin alumnos.</div>";
    return;
  }
  const table = document.createElement("table");
  table.innerHTML = `
    <thead><tr>
      <th>Clave</th><th>Alumno</th><th>Presente</th><th>Nota</th>
    </tr></thead>
  `;
  const tbody = document.createElement("tbody");

  asistenciaDraft.forEach((r, idx)=>{
    const tr = document.createElement("tr");

    const tdC = document.createElement("td");
    tdC.textContent = r.clave_alumno;

    const tdA = document.createElement("td");
    tdA.textContent = `${r.apellidos} ${r.nombres}`;

    const tdP = document.createElement("td");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!r.presente;
    chk.addEventListener("change", ()=>{ asistenciaDraft[idx].presente = chk.checked; });
    tdP.appendChild(chk);

    const tdN = document.createElement("td");
    const inp = document.createElement("input");
    inp.className = "input";
    inp.placeholder = "Opcional";
    inp.value = r.nota || "";
    inp.addEventListener("input", ()=>{ asistenciaDraft[idx].nota = inp.value; });
    tdN.appendChild(inp);

    tr.appendChild(tdC); tr.appendChild(tdA); tr.appendChild(tdP); tr.appendChild(tdN);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  div.innerHTML = "";
  div.appendChild(table);
}

async function guardarAsistencia(){
  setMsg("asistMsg","");
  const clave_grupo = $("selGrupoA").value;
  const fecha_clase = $("fechaClase").value;

  const payload = {
    clave_grupo,
    fecha_clase,
    items: asistenciaDraft.map(r=>({
      id_inscripcion: r.id_inscripcion,
      presente: r.presente,
      nota: r.nota
    }))
  };

  // Si offline: cola
  if (!isOnline()){
    enqueue({ type:"asistencia", payload });
    setMsg("asistMsg","Guardado en cola offline. Sincroniza cuando tengas conexión.");
    return;
  }

  const res = await apiPost("registrarAsistencia", payload);
  if (!res.ok) return setMsg("asistMsg", res.error || "Error al guardar", true);
  setMsg("asistMsg", `Asistencia registrada. Nuevos registros: ${res.inserted}`);
}

// ====== SYNC ======
async function syncQueue(){
  if (!isOnline()) return;
  const q = loadQueue();
  if (q.length === 0) return;

  let okCount = 0;
  const rest = [];
  for (const item of q){
    try{
      if (item.type === "asistencia"){
        const res = await apiPost("registrarAsistencia", item.payload);
        if (res.ok) okCount++;
        else rest.push(item);
      } else {
        rest.push(item);
      }
    } catch(e){
      rest.push(item);
    }
  }
  saveQueue(rest);
  alert(`Sync terminado. Enviados: ${okCount}. Pendientes: ${rest.length}.`);
}

// ====== ADMIN TABS ======
function bindAdminTabs(){
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(t=>{
    t.addEventListener("click", ()=>{
      tabs.forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      const name = t.dataset.tab;

      ["tabAlumno","tabGrupo","tabInscribir","tabPago","tabUsuario"].forEach(id=>hide($(id)));
      if (name === "alumno") show($("tabAlumno"));
      if (name === "grupo") show($("tabGrupo"));
      if (name === "inscribir") show($("tabInscribir"));
      if (name === "pago") show($("tabPago"));
      if (name === "usuario") show($("tabUsuario"));
    });
  });
}

async function adminCrearAlumno(){
  setMsg("adminMsgAlumno","");
  const body = {
    clave_alumno: $("aClave").value.trim(),
    apellidos: $("aAp").value.trim(),
    nombres: $("aNom").value.trim(),
    correo: $("aMail").value.trim(),
    telefono: $("aTel").value.trim(),
    estatus: $("aEst").value
  };
  const res = await apiPost("crearAlumno", body);
  if (!res.ok) return setMsg("adminMsgAlumno", res.error || "Error", true);
  setMsg("adminMsgAlumno", `Alumno creado. ID: ${res.id_alumno}`);
}

async function adminCrearGrupo(){
  setMsg("adminMsgGrupo","");
  const body = {
    clave_grupo: $("gClave").value.trim(),
    clave_curso: $("gCurso").value.trim(),
    periodo: $("gPeriodo").value.trim(),
    fecha_inicio: $("gIni").value,
    fecha_fin: $("gFin").value,
    cupo: Number($("gCupo").value || 0),
    sede: $("gSede").value.trim(),
    estatus: $("gEst").value
  };
  const res = await apiPost("crearGrupo", body);
  if (!res.ok) return setMsg("adminMsgGrupo", res.error || "Error", true);
  setMsg("adminMsgGrupo", `Grupo creado. ID: ${res.id_grupo}`);
  await loadGrupos(); await hydrateSelects();
}

async function adminInscribir(){
  setMsg("adminMsgIns","");
  const body = { clave_grupo: $("iGrupo").value.trim(), clave_alumno: $("iAlumno").value.trim() };
  const res = await apiPost("inscribir", body);
  if (!res.ok) return setMsg("adminMsgIns", res.error || "Error", true);
  setMsg("adminMsgIns", `Inscripción OK. ID: ${res.id_inscripcion}${res.ya_existia ? " (ya existía)" : ""}`);
}

async function adminPago(){
  setMsg("adminMsgPago","");
  const body = {
    id_inscripcion: Number($("pIdIns").value || 0),
    monto: Number($("pMonto").value || 0),
    metodo: $("pMet").value,
    estatus_pago: $("pEst").value,
    referencia: $("pRef").value.trim(),
    nota: $("pNota").value.trim()
  };
  const res = await apiPost("registrarPago", body);
  if (!res.ok) return setMsg("adminMsgPago", res.error || "Error", true);
  setMsg("adminMsgPago", `Pago registrado. ID: ${res.id_pago}`);
}

async function adminCrearUsuario(){
  setMsg("adminMsgUser","");
  const body = { nombre: $("uNombre").value.trim(), rol: $("uRol").value, pin: $("uPin").value.trim() };
  const res = await apiPost("crearUsuario", body);
  if (!res.ok) return setMsg("adminMsgUser", res.error || "Error", true);
  setMsg("adminMsgUser", `Usuario creado. ID: ${res.id_usuario}`);
}

// ====== REPORTES ======
async function repAdeudos(){
  const res = await apiGet("reporteAdeudos");
  if (!res.ok) {
    $("reportOut").innerHTML = `<div class='muted' style='padding:10px'>${res.error || "Error"}</div>`;
    return;
  }
  const rows = (res.adeudos || []).map(x=>({
    "Alumno": x.alumno,
    "Grupo": x.clave_grupo,
    "Curso": x.curso,
    "Precio": x.precio_referencia,
    "Pagado": x.total_pagado,
    "Saldo": x.saldo_pendiente
  }));
  renderTable("reportOut", ["Alumno","Grupo","Curso","Precio","Pagado","Saldo"], rows);
}

async function repPagos(){
  const desde = $("rDesde").value || "";
  const hasta = $("rHasta").value || "";
  const res = await apiGet("reportePagos", { desde, hasta });
  if (!res.ok) {
    $("reportOut").innerHTML = `<div class='muted' style='padding:10px'>${res.error || "Error"}</div>`;
    return;
  }
  const rows = (res.pagos || []).map(x=>({
    "Fecha": (x.fecha_pago && x.fecha_pago.toString) ? x.fecha_pago.toString().slice(0,10) : x.fecha_pago,
    "Monto": x.monto,
    "Método": x.metodo,
    "Estatus": x.estatus_pago,
    "Alumno": `${x.clave_alumno} ${x.alumno}`,
    "Grupo": x.clave_grupo
  }));
  renderTable("reportOut", ["Fecha","Monto","Método","Estatus","Alumno","Grupo"], rows);
}

// ====== INIT ======
async function init(){
  updateNetBadge();
  bindBackButtons();

  // PWA Service Worker
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("sw.js"); } catch {}
  }

  $("btnLogin").addEventListener("click", login);
  $("btnLogout").addEventListener("click", ()=>{
    clearSession(); go("login");
  });
  $("btnSync").addEventListener("click", syncQueue);

  // Tiles
  document.querySelectorAll(".tile").forEach(b=>{
    b.addEventListener("click", async ()=>{
      const v = b.dataset.view;
      if (v === "grupos") { await loadGrupos(); await hydrateSelects(); go("grupos"); }
      if (v === "asistencia") { await loadGrupos(); await hydrateSelects(); go("asistencia"); }
      if (v === "admin") go("admin");
      if (v === "reportes") go("reportes");
    });
  });

  // Grupos actions
  $("btnCargarRoster").addEventListener("click", cargarRoster);

  // Asistencia actions
  $("btnCargarA").addEventListener("click", cargarAsistencia);
  $("btnGuardarAsistencia").addEventListener("click", guardarAsistencia);

  // Admin
  bindAdminTabs();
  $("btnCrearAlumno").addEventListener("click", adminCrearAlumno);
  $("btnCrearGrupo").addEventListener("click", adminCrearGrupo);
  $("btnInscribir").addEventListener("click", adminInscribir);
  $("btnPago").addEventListener("click", adminPago);
  $("btnUsuario").addEventListener("click", adminCrearUsuario);

  // Reportes
  $("btnAdeudos").addEventListener("click", repAdeudos);
  $("btnPagos").addEventListener("click", repPagos);

  // Session restore
  if (state.token){
    if (state.rol === "ADMIN") show($("tileAdmin"));
    await loadGrupos(); await hydrateSelects();
    await loadResumen();
    go("dash");
  } else {
    go("login");
  }
}
init();
