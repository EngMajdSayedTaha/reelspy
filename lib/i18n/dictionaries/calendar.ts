// Calendar dictionary domain: `/dashboard/calendar` page + `CalendarView`
// (month grid, unscheduled-scripts tray, scheduled-post drag/drop). Composed
// into the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  calendar: {
    pageTitle: "Calendar",
    subtitle:
      "Drag scripts onto a day to schedule them — scheduled posts from Publishing show up here automatically.",
    legendScript: "Script — drag onto a day to plan it",
    legendPost: "Scheduled post — drag to reschedule",
    pickDayFor: (hook: string) => `Pick a day for "${hook}"`,
    cancelPlacing: "Cancel placing",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    scheduledPostsHeading: "Scheduled posts",
    scheduledPostFallback: "Scheduled post",
    postFallbackShort: "Post",
    dragToReschedule: "drag to reschedule",
    dragToRescheduleHint: "Drag this post to another day to reschedule it.",
    scriptStatus: {
      draft: "Draft",
      ready: "Ready",
      published: "Published",
    } as Record<string, string>,
    postStatus: {
      scheduled: "Scheduled",
      publishing: "Publishing",
      processing: "Processing",
      partial: "Partial",
      done: "Done",
      published: "Published",
      failed: "Failed",
    } as Record<string, string>,
    unschedule: "Unschedule",
    noHookFallback: "No hook",
    openInScripts: "Open in Scripts",
    unscheduledScriptsHeading: "Unscheduled scripts",
    dragHelperText:
      "Drag a script onto a day — or tap it, then tap a day. Drop a scheduled chip here to unschedule it.",
    emptyUnscheduled: "Nothing waiting. Generate scripts on the Scripts page.",
    untitledScript: "Untitled script",
    dragOrTapHint: "Drag onto a day, or tap then tap a day",
    fallbackScript: "Script",
    scriptTooltip: (hookOrFallback: string) => `${hookOrFallback} — click to view, drag to another day`,
    scheduledForDate: (date: string) => `Scheduled for ${date}`,
    couldNotSchedule: "Could not schedule the script.",
    movedBackToUnscheduled: "Moved back to unscheduled",
    couldNotUnschedule: "Could not unschedule the script.",
    postMovedTo: (date: string) => `Post moved to ${date}`,
    couldNotReschedulePost: "Could not reschedule the post.",
    moreCount: (n: number) => `+${n} more`,
  },
};

export type CalendarDict = typeof en;
export const calendarEn = en;

export const calendarAr: CalendarDict = {
  calendar: {
    pageTitle: "التقويم",
    subtitle: "اسحب النصوص إلى يوم لجدولتها — تظهر هنا تلقائيًا المنشورات المجدولة من قسم النشر.",
    legendScript: "نص — اسحبه إلى يوم لتخطيطه",
    legendPost: "منشور مجدول — اسحبه لإعادة الجدولة",
    pickDayFor: (hook: string) => `اختر يومًا لـ"${hook}"`,
    cancelPlacing: "إلغاء التنسيب",
    previousMonth: "الشهر السابق",
    nextMonth: "الشهر التالي",
    scheduledPostsHeading: "المنشورات المجدولة",
    scheduledPostFallback: "منشور مجدول",
    postFallbackShort: "منشور",
    dragToReschedule: "اسحب لإعادة الجدولة",
    dragToRescheduleHint: "اسحب هذا المنشور إلى يوم آخر لإعادة جدولته.",
    scriptStatus: {
      draft: "مسودة",
      ready: "جاهز",
      published: "منشور",
    },
    postStatus: {
      scheduled: "مجدول",
      publishing: "قيد النشر",
      processing: "قيد المعالجة",
      partial: "جزئي",
      done: "تم",
      published: "منشور",
      failed: "فشل",
    },
    unschedule: "إلغاء الجدولة",
    noHookFallback: "بدون جملة افتتاحية",
    openInScripts: "فتح في النصوص",
    unscheduledScriptsHeading: "النصوص غير المجدولة",
    dragHelperText:
      "اسحب نصًا إلى يوم — أو اضغط عليه ثم اضغط على يوم. أفلت شريحة مجدولة هنا لإلغاء جدولتها.",
    emptyUnscheduled: "لا يوجد شيء بالانتظار. أنشئ نصوصًا من صفحة النصوص.",
    untitledScript: "نص بلا عنوان",
    dragOrTapHint: "اسحب إلى يوم، أو اضغط ثم اضغط على يوم",
    fallbackScript: "نص",
    scriptTooltip: (hookOrFallback: string) => `${hookOrFallback} — اضغط للعرض، اسحب ليوم آخر`,
    scheduledForDate: (date: string) => `تمت الجدولة ليوم ${date}`,
    couldNotSchedule: "تعذّرت جدولة النص.",
    movedBackToUnscheduled: "أُعيد إلى غير المجدول",
    couldNotUnschedule: "تعذّر إلغاء جدولة النص.",
    postMovedTo: (date: string) => `انتقل المنشور إلى ${date}`,
    couldNotReschedulePost: "تعذّرت إعادة جدولة المنشور.",
    moreCount: (n: number) => `+${n} أخرى`,
  },
};
