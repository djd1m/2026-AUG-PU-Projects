#!/bin/bash
# Блокирующие ворота визуальной проверки (модуль 07 пп. 3–4). Детерминированно проверяет ДЕКЛАРАЦИЮ просмотра:
#   1) proof/verdict.tsv: у КАЖДОГО листа из index.tsv есть исход из закрытого списка; sha256 mp4 в index.tsv = текущему
#      файлу (лист смотрели на ЭТОМ ролике); любой «отклонён», дефект ≠ «нет» или «демо-пометка не видна» — отказ;
#   2) captions-proof.tsv: у КАЖДОГО титра над записью (CAPTION screen из config-inspect.tsv) есть строка
#      «титр → файл записи → интервал → что в кадре доказывает → исход», файл записи существует; «отклонён» — отказ.
#   bash .claude/skills/promo-video/scripts/gate-verdict.sh <proof-dir> <каталог mp4> <config-inspect.tsv> <captions-proof.tsv> [каталог записей] [demo-intervals.tsv]
#   demo-intervals.tsv — секунды ГОТОВОГО ролика, где в кадре вымышленные данные (строки «6-17»); на каждом листе,
#   задевающем такой интервал, демо-пометка обязана быть «видна» (во всех трёх форматах), «нет-демо-данных» там — отказ.
# 1.2 (сквозной прогон N3, замечание 12): verdict.tsv несёт sha256 mp4, по которому вынесен исход (столбец 5, пишет
#   storyboard.sh); ≠ sha листа в index.tsv — отказ (исход с другого рендера); столбца нет (формат до 1.2) — НЕ выполнено:
#   пересобрать раскадровку, исходы неизменённых листов storyboard.sh перенесёт сам.
# Коды: 0 — всё принято · 1 — отказ назван · 2 — проверка НЕ выполнена (нет файлов, пропуски «?», неизвестные значения).
# Что видно на листе, решает глаз (слой 4); этот страж только не даёт выдать непросмотренное или отклонённое за «готово».
set -uo pipefail
P=${1:-}; MP4=${2:-}; INSPECT=${3:-}; CAPS=${4:-}; REC=${5:-}; DEMO=${6:-}
if [ -n "$DEMO" ]; then [ -r "$DEMO" ] || { echo "❌ demo-intervals $DEMO не читается — НЕ выполнено" >&2; exit 2; }; fi
# лист задевает демо-интервал? интервал листа: «a-b» (шаг) или «кадры n-m (t=…)» (стык)
in_demo() { [ -n "$DEMO" ] || return 1; awk -v iv="$1" 'BEGIN{ if (iv ~ /^кадры/) { split(iv, x, /[ -]/); a=x[2]/30; b=x[3]/30 } else { split(iv, x, "-"); a=x[1]; b=x[2] } } /^[0-9]/ { split($0, d, "-"); if (a < d[2]+0 && d[1]+0 < b) f=1 } END{ exit !f }' "$DEMO"; }
for f in "$P/index.tsv" "$P/verdict.tsv" "$INSPECT" "$CAPS"; do [ -s "$f" ] || { echo "❌ нет или пуст $f — НЕ выполнено" >&2; exit 2; }; done
bad=0; undone=0
declare -A SHA
for f in 16x9 9x16 1x1; do [ -s "$MP4/$f.mp4" ] || { echo "❌ нет $MP4/$f.mp4 — НЕ выполнено" >&2; exit 2; }; SHA[$f]=$(sha256sum "$MP4/$f.mp4" | cut -c1-64); done
# 1. Листы.
declare -A V_OUT V_DEF V_DEMO V_SHA
while IFS=$'\t' read -r sheet out def demo vsha _; do
  [[ "$sheet" == \#* || -z "$sheet" ]] && continue
  V_OUT[$sheet]=$out; V_DEF[$sheet]=$def; V_DEMO[$sheet]=$demo
  [[ "$vsha" =~ ^[0-9a-f]{64}$ ]] && V_SHA[$sheet]=$vsha || V_SHA[$sheet]=""
done < "$P/verdict.tsv"
rows=0
while IFS=$'\t' read -r sheet fmt kind interval sha; do
  [ "$sheet" = лист ] && continue; rows=$((rows+1))
  [ "$sha" = "${SHA[$fmt]:-}" ] || { echo "❌ $sheet: снят с mp4 sha256 ${sha:0:12}…, текущий $fmt.mp4 — ${SHA[$fmt]:0:12}… (пересобрать раскадровку)"; bad=1; }
  [ -s "$P/$sheet" ] || { echo "❌ $sheet: файла листа нет — НЕ выполнено" >&2; undone=1; continue; }
  out=${V_OUT[$sheet]:-}; def=${V_DEF[$sheet]:-}; demo=${V_DEMO[$sheet]:-}
  case "$out" in принят|отклонён) ;; *) echo "❌ $sheet ($fmt $interval): исход «$out» — лист не просмотрен" >&2; undone=1; continue ;; esac
  case "$def" in нет|цена|бренд|ip|ключ|титр-обрезан|элемент-обрезан|демо-пометка-пропала|другое:?*) ;; *) echo "❌ $sheet: дефект «$def» не из списка" >&2; undone=1; continue ;; esac
  case "$demo" in видна|"не видна"|нет-демо-данных) ;; *) echo "❌ $sheet: демо-пометка «$demo» не из списка" >&2; undone=1; continue ;; esac
  vsha=${V_SHA[$sheet]:-}
  [ -n "$vsha" ] || { echo "❌ $sheet: в verdict.tsv нет sha256 mp4 (формат до 1.2) — пересобрать раскадровку storyboard.sh" >&2; undone=1; continue; }
  [ "$vsha" = "$sha" ] || { echo "❌ $sheet: исход вынесен по mp4 ${vsha:0:12}…, лист снят с ${sha:0:12}… — просмотреть заново"; bad=1; }
  [ "$out" = принят ] && [ "$def" = нет ] && [ "$demo" != "не видна" ] || { echo "❌ $sheet ($fmt $interval): исход $out, дефект $def, демо-пометка $demo"; bad=1; }
  [ "$out" = принят ] && [ "$def" != нет ] && { echo "❌ $sheet: «принят» при дефекте «$def» — противоречие"; bad=1; }
  if in_demo "$interval" && [ "$demo" != видна ]; then echo "❌ $sheet ($fmt $interval): интервал с вымышленными данными, а демо-пометка «$demo»"; bad=1; fi
done < "$P/index.tsv"
[ $rows -gt 0 ] || { echo "❌ index.tsv без листов — НЕ выполнено" >&2; exit 2; }
# 2. Титры ↔ кадр.
declare -A C_FILE C_INT C_WHY C_OUT
while IFS=$'\t' read -r cap file interval why out; do
  [[ "$cap" == \#* || -z "$cap" ]] && continue
  C_FILE[$cap]=$file; C_INT[$cap]=$interval; C_WHY[$cap]=$why; C_OUT[$cap]=$out
done < "$CAPS"
ncap=0
while IFS=$'\t' read -r tag kind _ _ text; do
  [ "$tag" = CAPTION ] && [ "$kind" = screen ] || continue; ncap=$((ncap+1))
  [ -n "${C_OUT[$text]+x}" ] || { echo "❌ титр «$text»: нет строки в $(basename "$CAPS") — кадр-доказательство не назван"; bad=1; continue; }
  case "${C_OUT[$text]}" in принят|отклонён) ;; *) echo "❌ титр «$text»: исход «${C_OUT[$text]}» не из списка принят|отклонён" >&2; undone=1; continue ;; esac
  [[ "${C_INT[$text]}" =~ ^[0-9]+([.,][0-9]+)?-[0-9]+([.,][0-9]+)?$ ]] || { echo "❌ титр «$text»: интервал «${C_INT[$text]}» не вида 12,5-14" >&2; undone=1; }
  [ -n "${C_WHY[$text]// /}" ] || { echo "❌ титр «$text»: пусто «что в кадре доказывает»" >&2; undone=1; }
  if [ -n "$REC" ] && [ ! -s "$REC/${C_FILE[$text]}" ]; then echo "❌ титр «$text»: файла записи ${C_FILE[$text]} нет в $REC"; bad=1; fi
  [ "${C_OUT[$text]}" = принят ] || { echo "❌ титр «$text» отклонён: ${C_WHY[$text]}"; bad=1; }
done < "$INSPECT"
[ $ncap -gt 0 ] || { echo "❌ в $INSPECT нет CAPTION screen — НЕ выполнено" >&2; exit 2; }
[ $bad = 1 ] && { echo "❌ визуальная проверка: ОТКАЗ"; exit 1; }
[ $undone = 1 ] && { echo "❌ визуальная проверка НЕ выполнена полностью (пропуски выше)" >&2; exit 2; }
echo "✅ листов $rows и титров $ncap: всё принято, sha256 листов = текущим mp4"
