'use strict';

/**
 * INNOVAAFRIC — Central role definitions
 *
 * Hierarchy levels (higher = more access):
 *  0  customer / rider / supplier / api_partner
 *  1  field ops: city_coordinator, rider_coordinator, business_developer
 *  2  specialists: kyc_officer, loan_officer, support_agent, marketing_manager,
 *                  tax_officer, payroll_manager
 *  3  managers: support_supervisor, compliance_officer, finance_officer, risk_officer,
 *               auditor
 *  4  executives: country_manager
 *  5  executives: regional_director
 *  9  super_admin
 */

const ROLES = {
  // ── End-user roles ──────────────────────────────────────
  customer:           { level: 0, label: 'Cliente',               dashboard: false },
  rider:              { level: 0, label: 'Rider',                  dashboard: false },
  supplier:           { level: 0, label: 'Proveedor',              dashboard: false },
  circular_autorizada:{ level: 0, label: 'Circular Autorizada',    dashboard: false },
  api_partner:        { level: 0, label: 'API Partner',            dashboard: true,  modules: ['apikeys'] },

  // ── Field Operations ─────────────────────────────────────
  city_coordinator:   { level: 1, label: 'Coordinador de Ciudad',  dashboard: true,
                        modules: ['overview','users','riders','delivery','ranking'] },
  rider_coordinator:  { level: 1, label: 'Coordinador de Riders',  dashboard: true,
                        modules: ['overview','riders','delivery','payroll'] },
  business_developer: { level: 1, label: 'Business Developer',     dashboard: true,
                        modules: ['overview','users','business','campaigns'] },

  // ── Specialists ───────────────────────────────────────────
  kyc_officer:        { level: 2, label: 'Oficial KYC',            dashboard: true,
                        modules: ['overview','kyc','users'] },
  loan_officer:       { level: 2, label: 'Oficial de Préstamos',   dashboard: true,
                        modules: ['overview','loans','users'] },
  support_agent:      { level: 2, label: 'Agente de Soporte',      dashboard: true,
                        modules: ['overview','tickets','users','chat'] },
  marketing_manager:  { level: 2, label: 'Manager de Marketing',   dashboard: true,
                        modules: ['overview','campaigns','users','emails','notifications'] },
  tax_officer:        { level: 2, label: 'Oficial Fiscal',         dashboard: true,
                        modules: ['overview','taxes','accounting'] },
  payroll_manager:    { level: 2, label: 'Manager de Nóminas',     dashboard: true,
                        modules: ['overview','payroll','riders'] },

  // ── Managers ──────────────────────────────────────────────
  support_supervisor: { level: 3, label: 'Supervisor de Soporte',  dashboard: true,
                        modules: ['overview','tickets','users','chat','notifications'] },
  compliance_officer: { level: 3, label: 'Oficial de Cumplimiento',dashboard: true,
                        modules: ['overview','kyc','users','audit','loans','reports'] },
  finance_officer:    { level: 3, label: 'Oficial Financiero',     dashboard: true,
                        modules: ['overview','txns','accounting','taxes','payroll','loans','transfers','reports'] },
  risk_officer:       { level: 3, label: 'Oficial de Riesgos',     dashboard: true,
                        modules: ['overview','txns','loans','users','audit','reports'] },
  auditor:            { level: 3, label: 'Auditor',                dashboard: true,
                        modules: ['overview','txns','users','audit','reports','accounting'] },

  // ── Executives ────────────────────────────────────────────
  country_manager:    { level: 4, label: 'Director de País',       dashboard: true,
                        modules: ['overview','users','txns','kyc','loans','delivery','riders',
                                  'payroll','campaigns','tickets','emails','reports','audit','ranking','countryconfig'] },
  regional_director:  { level: 5, label: 'Director Regional',      dashboard: true,
                        modules: ['overview','users','txns','kyc','loans','delivery','riders',
                                  'payroll','campaigns','tickets','emails','reports','audit',
                                  'ranking','countryconfig','accounting','taxes','transfers'] },

  // ── Super Admin ───────────────────────────────────────────
  super_admin:        { level: 9, label: 'Super Admin',            dashboard: true,  modules: ['*'] },
  admin:              { level: 9, label: 'Admin',                  dashboard: true,  modules: ['*'] },
};

/** Roles that can access the admin dashboard */
const DASHBOARD_ROLES = Object.entries(ROLES)
  .filter(([, v]) => v.dashboard)
  .map(([k]) => k);

/** All roles that can be assigned via admin panel (not self-registered) */
const STAFF_ROLES = Object.keys(ROLES).filter(r =>
  !['customer','rider','supplier','circular_autorizada'].includes(r)
);

/** Roles a user can self-register with */
const PUBLIC_ROLES = ['customer', 'circular_autorizada', 'rider', 'supplier'];

function getRoleLevel(role) {
  return ROLES[role]?.level ?? -1;
}

function getRoleLabel(role) {
  return ROLES[role]?.label ?? role;
}

/** Returns true if the actor's role level is >= the target role level */
function canManageRole(actorRole, targetRole) {
  return getRoleLevel(actorRole) > getRoleLevel(targetRole);
}

/** Returns the list of dashboard modules a role can access */
function getRoleModules(role) {
  const r = ROLES[role];
  if (!r || !r.dashboard) return [];
  if (r.modules.includes('*')) return ['*'];
  return r.modules;
}

module.exports = { ROLES, DASHBOARD_ROLES, STAFF_ROLES, PUBLIC_ROLES, getRoleLevel, getRoleLabel, canManageRole, getRoleModules };
