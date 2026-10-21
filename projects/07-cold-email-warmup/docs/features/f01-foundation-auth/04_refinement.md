# F01 focused verification

Meaningful tests: registration/login/logout twice, persistedsessiondigest,
expired/revoked/inactive forged sessions,origin/noauth0mutations,two tenants own200
foreign404,UUID/SQLpayload400,inputchar/bytebound beforeKDF,exactstoredhashparams,
KDF2saturation/finallyrelease and unrelatedfreeslot,atomicrate boundaryUTCwindows
and spoofedforwardedIP. Use actual PostgreSQL for state/race checks, no in-memory
substitution. Tests CPU2; coordinate heavy run start, no real sending/charging.
Run typecheck/lint/build and focusedsuite once; rerun only relevantfailures.
Fresh independent Astra review after sourcefreeze. Browserpreflight/actualshared
container authE2E when runnable; fullcabinet journeys remain F06.
