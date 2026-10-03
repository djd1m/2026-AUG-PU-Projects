# F06 interaction/state algorithm

GET/app authenticates server session; shell has no embedded secrets. Serve only known sameorigin assets with CSP. Bootstrap gets identity/safe modes +bounded APIs; request epoch increments on login/logout/401, abort in-flight and clear private DOM. Any completion renders only if its epoch matches current identity; errors andfinally obeysamefence. No remembered sensitivefields inlocalStorage.

Each form parses ordinary product fields, calls accepted authoritative API and rerenders from response/reload; saving neverauto-grants. Separate explicit consent afterreadingcurrentversion; editingcampaign invalidatesgrant so UI reloads. Savecredentials clears secretformfields aftersuccess; reads mask and neverprefill. Separate actionstart/pause/revoke, no hidden scheduler/provider operatorcalls.

Evidence list selectsownpair→compare API→eligible explicitshare withstablekey→publicreport link. Source/reference remainprivate, publicHTMLserverwhitelist. Checkout intent stablekey foridenticalpayload→showpending→userrefresh retrievescanonicalstatus; trustedtestharness operatorconfirms outsidebrowser. Publicbadge uses servercurrententitlement unchanged.

Browser harness records source/build/preflight, seeds onlylocaltest state through trustedexistinginterfaces, then realclicks +DB/APIpostconditions. Two contexts isolate tenants; delay testresponses only as networktiming withoutmockingbusinesslogic, assert epoch prevents staleDOM. Mutexes separateheavy/UI; sequentialengines, owncontexts/sockets/networkcleanup. Measure10concurrent authenticatedreads andsaveactualdistribution.
