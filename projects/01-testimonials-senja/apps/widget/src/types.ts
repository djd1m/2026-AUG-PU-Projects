// src/types.ts
//
// Локальные типы контракта `GET /api/widget/config` (docs/Pseudocode.md §5.1,
// docs/Architecture.md §3 "Модель данных", §4.2).
//
// [GAP: канонический пакет `packages/shared-types` (см. .claude/rules/coding-style.md §1)
// на момент генерации этого пакета ещё не собран — его строит параллельно другой агент.
// Здесь — локальная копия минимально необходимой формы ответа, чтобы apps/widget не зависел
// от ещё не готового workspace-пакета и не блокировал сборку. Когда `@proofwall/shared-types`
// появится и будет содержать `Testimonial`/`WidgetConfigResponse`, эти типы следует заменить
// импортом оттуда, а не поддерживать два источника истины.]

/** Одна карточка отзыва в ответе виджета — только поля, нужные для рендера (FR-006). */
export interface WidgetTestimonial {
  id: string;
  author_name: string;
  author_role: string | null;
  /** Текст отзыва — хранится и передаётся побайтово как отправлено (security.md §1). */
  text: string;
  /** Заполнено только для видео-отзывов с завершённой транскрипцией (Architecture §5). */
  transcript?: string | null;
  /**
   * Единственное допустимое значение источника транскрипта на MVP — канон Architecture §10.
   * Наличие поля используется для рендера пометки "машинная расшифровка" (security.md §5).
   */
  transcript_source?: 'machine' | null;
}

/** Ответ `GET /api/widget/config` (Pseudocode.md §5.1 `apiWidgetConfig`). */
export interface WidgetConfigResponse {
  testimonials: WidgetTestimonial[];
  /**
   * ADR-002 / FR-GROWTH-003: единственное, что виджет знает о тарифе — уже вычисленное сервером
   * решение. Поле `tier` сюда сознательно не входит и не должно быть добавлено.
   */
  badge_required: boolean;
  project_slug: string;
  /**
   * FR-GROWTH-003: адрес, куда ведёт badge, с UTM-метками источника. Строится СЕРВЕРОМ —
   * виджет стоит на чужом домене и не знает публичный адрес приложения. Приходит только
   * когда `badge_required = true`; без него badge остался бы ссылкой в никуда, и петля
   * роста была бы разомкнута.
   */
  badge_url?: string;
  /** [GAP: форма branding не описана в документах — Architecture §4.2 упоминает поле по имени] */
  branding?: Record<string, unknown>;
}
