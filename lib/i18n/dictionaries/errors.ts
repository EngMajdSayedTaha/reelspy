// Errors dictionary domain: root/segment error boundaries (`app/error.tsx`,
// `app/global-error.tsx`, `app/dashboard/error.tsx`) and the 404 page
// (`app/not-found.tsx`). Generic "Loading…" copy lives in `common.loading` —
// this file only holds strings specific to error/not-found states. Composed
// into the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  errors: {
    notFoundTitle: "Page not found",
    notFoundMessage: "The page you're looking for doesn't exist or may have moved.",
    backToDashboard: "Back to dashboard",
    unexpectedMessage:
      "An unexpected error occurred. You can try again, and if it keeps happening, reload the page.",
    globalUnexpectedMessage: "An unexpected error occurred. Please try again.",
    segmentErrorTitle: "This page hit an error",
    segmentErrorMessage:
      "Something went wrong loading this section. Try again, or head back to the dashboard.",
  },
};

export type ErrorsDict = typeof en;
export const errorsEn = en;

export const errorsAr: ErrorsDict = {
  errors: {
    notFoundTitle: "الصفحة غير موجودة",
    notFoundMessage: "الصفحة التي تبحث عنها غير موجودة أو ربما تم نقلها.",
    backToDashboard: "العودة إلى لوحة التحكم",
    unexpectedMessage:
      "حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى، وإذا استمرت المشكلة فأعد تحميل الصفحة.",
    globalUnexpectedMessage: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
    segmentErrorTitle: "حدث خطأ في هذه الصفحة",
    segmentErrorMessage: "حدث خطأ أثناء تحميل هذا القسم. حاول مرة أخرى أو عد إلى لوحة التحكم.",
  },
};
