# Отзыв с площадки · Архитектурная дельта

## Миграция 017

```sql
alter table testimonials add column source_url text;
alter table testimonials add column source_platform text;
alter table testimonials add column screenshot_object_key text;

alter table testimonials drop constraint testimonials_source_check;
alter table testimonials add constraint testimonials_source_check
  check (source in ('form','import','demo','platform'));

-- Отзыв «с площадки» без доказательства — это просто текст, набранный владельцем.
-- Ограничение не даёт ему маскироваться под перенесённый.
alter table testimonials add constraint ck_platform_has_proof
  check (source <> 'platform' or source_url is not null or screenshot_object_key is not null);

-- И обратно: поля источника бессмысленны у отзыва, пришедшего через нашу форму.
alter table testimonials add constraint ck_source_fields_only_platform
  check (source = 'platform' or (source_url is null and source_platform is null));
```

Второе ограничение важнее, чем кажется: без него завтра появится отзыв `source='form'` со
ссылкой на Яндекс, и никто не скажет, что это значит.

## Хранилище снимков — существующий бакет, отдельный префикс

Снимки кладутся в **тот же бакет, что фото авторов**, под префиксом `screenshots/`. Новый бакет
не заводится намеренно: сегодня утром выяснилось, чего стоит бакет, который код ожидает, а никто
не создал — приём видео отвечал 503 на каждой попытке, и это было невидимо, пока не прошли путь
целиком. Меньше бакетов — меньше мест, где это повторится.

## Две поверхности рендера — и это главная цена фичи

| Поверхность | Файл | Особенность |
|---|---|---|
| Страница стены | `apps/web/src/app/w/[slug]/page.tsx` | серверный рендер, экранирование обязательно |
| Виджет на чужом сайте | `apps/widget/src/render.ts` | Shadow DOM, только безопасные DOM-вызовы, бюджет ≤ 30 КБ |
| Конфиг виджета | `apps/web/src/app/api/widget/config/route.ts` | новые поля обязаны попасть в ответ, иначе виджет их не увидит |

Виджет **нельзя** рендерить через разметку строкой: правило проекта требует безопасных DOM-вызовов
для пользовательского текста. Ссылка источника собирается созданием узла, а не склейкой HTML.

Бюджет виджета: добавка — один `<img>`, одна ссылка и немного стилей. Текущий размер 6 618 байт
при пределе 30 720; запас есть, но после правки его надо **измерить**, а не предположить.

## Список хостов площадок — в коде

```
yandex_maps → yandex.ru, yandex.by, yandex.kz
twogis      → 2gis.ru, 2gis.kz, 2gis.ae
otzovik     → otzovik.com
flamp       → flamp.ru
other       → любой https-хост, но пометка «другой источник» без названия площадки
```

В коде, а не в переменной окружения — по той же причине, что список подсетей платёжного
провайдера: вынесенный наружу однажды приедет пустым, а пустой список хостов означает «принимать
любую ссылку».
