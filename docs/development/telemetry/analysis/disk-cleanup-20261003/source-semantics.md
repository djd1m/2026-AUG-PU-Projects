# Pinned upstream command and backend evidence

Buildx0.37.1: https://raw.githubusercontent.com/docker/buildx/v0.37.1/commands/prune.go
BuildKit0.33.0: https://raw.githubusercontent.com/moby/buildkit/v0.33.0/cache/manager.go
The excerpts below come directly from downloaded pinned files, not inferred from documentation.

## Buildx selector translation
```go
	filters := make([]string, 0, len(pruneFilters))
	for filterKey := range pruneFilters {
		if filterKey == untilKey {
			continue
		}

		values := getFilter(pruneFilters, filterKey)
		switch len(values) {
		case 0:
			filters = append(filters, filterKey)
		case 1:
			if filterKey == "id" {
				filters = append(filters, filterKey+"~="+values[0])
			} else if strings.HasSuffix(filterKey, "!") || strings.HasSuffix(filterKey, "~") {
				filters = append(filters, filterKey+"="+values[0])
			} else {
				filters = append(filters, filterKey+"=="+values[0])
			}
		default:
			return nil, errors.Errorf("%q filter expects only one value", filterKey)
		}
	}
	return &client.PruneInfo{
		KeepDuration: until,
		Filter:       []string{strings.Join(filters, ",")},
	}, nil
}
```
## Atomic BuildKit prune eligibility and filter application
```go
	var toDelete []*deleteRecord

	cm.mu.Lock()

	cutOff := time.Now().Add(-opt.keepDuration)
	gcMode := opt.keepBytes != 0

	locked := map[*sync.Mutex]struct{}{}

	for _, cr := range cm.records {
		if _, ok := locked[cr.mu]; ok {
			continue
		}
		cr.mu.Lock()

		// ignore duplicates that share data
		if cr.equalImmutable != nil && len(cr.equalImmutable.refs) > 0 || cr.equalMutable != nil && len(cr.refs) == 0 {
			cr.mu.Unlock()
			continue
		}

		if cr.isDead() {
			cr.mu.Unlock()
			continue
		}

		if len(cr.refs) == 0 {
			recordType := cr.GetRecordType()
			if recordType == "" {
				recordType = client.UsageRecordTypeRegular
			}

			shared := false
			if opt.checkShared != nil {
				shared = opt.checkShared.Exists(cr.ID(), cr.layerDigestChain())
			}

			if !opt.all {
				if recordType == client.UsageRecordTypeInternal || recordType == client.UsageRecordTypeFrontend || shared {
					cr.mu.Unlock()
					continue
				}
			}

			c := &client.UsageInfo{
				ID:          cr.ID(),
				Mutable:     cr.mutable,
				RecordType:  recordType,
				Shared:      shared,
				Description: cr.GetDescription(),
			}

			usageCount, lastUsedAt := cr.getLastUsed()
			c.LastUsedAt = lastUsedAt
			c.UsageCount = usageCount

			if opt.keepDuration != 0 {
				if lastUsedAt != nil && lastUsedAt.After(cutOff) {
					cr.mu.Unlock()
					continue
				}
			}

			if opt.filter.Match(adaptUsageInfo(c)) {
				toDelete = append(toDelete, &deleteRecord{
					cacheRecord: cr,
					lastUsedAt:  c.LastUsedAt,
					usageCount:  c.UsageCount,
				})
				locked[cr.mu] = struct{}{}
				continue // leave the record locked
			}
		}
		cr.mu.Unlock()
	}

```
## Same backend filtering for DiskUsage
```go
			Shared:      cr.shared,
		}
		if !filter.Match(adaptUsageInfo(c)) {
			continue
		}
		if opt.AgeLimit > 0 {
			if c.LastUsedAt != nil && c.LastUsedAt.After(cutOff) {
				continue
			}
		}
		du = append(du, c)
	}
```
## Boolean existence-field adapter shared by both methods
```go
func adaptUsageInfo(info *client.UsageInfo) filters.Adaptor {
	return filters.AdapterFunc(func(fieldpath []string) (string, bool) {
		if len(fieldpath) == 0 {
			return "", false
		}

		switch fieldpath[0] {
		case "id":
			return info.ID, info.ID != ""
		case "parents":
			return strings.Join(info.Parents, ";"), len(info.Parents) > 0
		case "description":
			return info.Description, info.Description != ""
		case "inuse":
			return "", info.InUse
		case "mutable":
			return "", info.Mutable
		case "immutable":
			return "", !info.Mutable
		case "type":
			return string(info.RecordType), info.RecordType != ""
		case "shared":
			return "", info.Shared
		case "private":
			return "", !info.Shared
		}

		// TODO: add int/datetime/bytes support for more fields

		return "", false
	})
}

type pruneOpt struct {
	filter       filters.Filter
```
