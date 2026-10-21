# F13 cross-read validation

FR13 требует studio kind и отсутствие parent, cap5 под row lock, childstudio_access=true. Schema/RLS уже реализованы foundation: service creates account under explicit studio authority; tenant reads/mutations remain actor-scoped. Application must distinguish actorstudio from childowner, especially createbot/source FK and sandboxquota. Explicit selectedaccount query is a selector verified under existingRLS, never alternate session.

F10 resolver currently locks bot existence but not account.parent membership. F13 must lock family decision through creationcommit and define deterministic account lock ordering, with real controlled SQL race matching futurehandover row update. F14 integration obligation remains documented; no transferendpoint now. Existing ordinaryowner/publicwidget/demo unaffected. Full M checks retained; no new schema/grants/deps or rolematrix. Continuous owner authorization covers existing canonical feature. Runtime/review/UI remain pending.
