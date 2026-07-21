-- Catálogo de bancos inicial. El catálogo estaba vacío, así que la pantalla
-- "Cuentas bancarias" no ofrecía ninguno. Se siembra en el deploy (migrate deploy
-- corre en cada arranque; el seed de prisma no). ON CONFLICT lo hace repetible.

INSERT INTO "Bank" ("id","name","country","currency","swiftCode","active","createdAt") VALUES
  ('bank_bgfi_ga',  'BGFIBank Gabon',                     'GA','XAF','BGFIGALI',true, now()),
  ('bank_bgfi_gq',  'BGFIBank Guinea Ecuatorial',         'GQ','XAF','BGFIGQGX',true, now()),
  ('bank_ccei_gq',  'CCEI Bank GE',                       'GQ','XAF','CCEIGQGX',true, now()),
  ('bank_bange_gq', 'BANGE (Banco Nacional GE)',          'GQ','XAF','BANGGQGX',true, now()),
  ('bank_soc_gq',   'Société Générale GE',                'GQ','XAF','SGGEGQGX',true, now()),
  ('bank_afri_cm',  'Afriland First Bank',                'CM','XAF','CFHBCMCX',true, now()),
  ('bank_uba_cm',   'UBA Cameroun',                       'CM','XAF','UNAFCMCX',true, now()),
  ('bank_soc_cm',   'Société Générale Cameroun',          'CM','XAF','SGCMCMCX',true, now()),
  ('bank_eco_sn',   'Ecobank Sénégal',                    'SN','XOF','ECOCSNDA',true, now()),
  ('bank_cbao_sn',  'CBAO Groupe Attijariwafa',           'SN','XOF','CBAOSNDX',true, now()),
  ('bank_soc_ci',   'Société Générale Côte d''Ivoire',    'CI','XOF','SGCICIAB',true, now()),
  ('bank_eco_ci',   'Ecobank Côte d''Ivoire',             'CI','XOF','ECOCCIAB',true, now()),
  ('bank_gtb_gh',   'GTBank Ghana',                       'GH','GHS','GTBIGHAC',true, now()),
  ('bank_eco_gh',   'Ecobank Ghana',                      'GH','GHS','ECOCGHAC',true, now()),
  ('bank_gtb_ng',   'Guaranty Trust Bank',                'NG','NGN','GTBINGLA',true, now()),
  ('bank_zen_ng',   'Zenith Bank',                        'NG','NGN','ZEIBNGLA',true, now()),
  ('bank_caixa_es', 'CaixaBank',                          'ES','EUR','CAIXESBB',true, now()),
  ('bank_bbva_es',  'BBVA',                               'ES','EUR','BBVAESMM',true, now()),
  ('bank_santa_es', 'Banco Santander',                    'ES','EUR','BSCHESMM',true, now()),
  ('bank_bnp_fr',   'BNP Paribas',                        'FR','EUR','BNPAFRPP',true, now()),
  ('bank_ca_fr',    'Crédit Agricole',                    'FR','EUR','AGRIFRPP',true, now())
ON CONFLICT ("id") DO NOTHING;
