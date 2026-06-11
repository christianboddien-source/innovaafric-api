'use strict';

// Techos de saldo por divisa — aplican a wallets de usuario y a la cuenta
// de unidades de las Circulares Autorizadas.
// cap: saldo máximo permitido. reloadThreshold: solo se puede recargar si el saldo actual es <= este valor.
const WALLET_LIMITS = {
  EUR: { cap: 3000,    reloadThreshold: 2800 },
  USD: { cap: 3000,    reloadThreshold: 2800 },
  XAF: { cap: 2000000, reloadThreshold: 1800000 },
  XOF: { cap: 2000000, reloadThreshold: 1800000 }
};

const CURRENCY_FIELD = { EUR: 'balanceEur', USD: 'balanceUsd', XAF: 'balanceXaf', XOF: 'balanceXof' };

module.exports = { WALLET_LIMITS, CURRENCY_FIELD };
