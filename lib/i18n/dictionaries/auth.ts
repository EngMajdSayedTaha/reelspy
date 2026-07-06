// Auth dictionary domain: the standalone login page (`app/login/page.tsx`) —
// sign-in/sign-up form copy and the OAuth-callback query-error map. Composed
// into the root `Dict` by `lib/i18n/dictionaries/index.ts`.

const en = {
  auth: {
    tagline: "Personal content intelligence",
    continueWithGoogle: "Continue with Google",
    or: "or",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    signIn: "Sign In",
    signUp: "Sign Up",
    supabaseMissingWarning: "Fill Supabase values in .env.local before authentication.",
    signupSuccessMessage: "Signup successful. Check your email to verify your account.",
    terms: "Terms",
    privacyPolicy: "Privacy Policy",
    cookiePolicy: "Cookie Policy",
    errors: {
      missingCode: "Missing OAuth code. Please try signing in again.",
      oauthExchangeFailed: "Google sign in failed. Please try again.",
      userNotFound: "Could not load your user profile. Please retry.",
      schemaMissing: "Supabase schema is missing. Run supabase/schema.sql in SQL Editor.",
      profileUpsertFailed: "Could not create your profile. Please retry.",
      supabaseEnvMissing: "Supabase environment variables are missing.",
    },
  },
};

export type AuthDict = typeof en;
export const authEn = en;

export const authAr: AuthDict = {
  auth: {
    tagline: "ذكاء المحتوى الشخصي",
    continueWithGoogle: "المتابعة عبر جوجل",
    or: "أو",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "you@example.com",
    passwordLabel: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signUp: "إنشاء حساب",
    supabaseMissingWarning: "أدخل قيم Supabase في .env.local قبل المصادقة.",
    signupSuccessMessage: "تم إنشاء الحساب بنجاح. تحقق من بريدك الإلكتروني لتفعيل حسابك.",
    terms: "الشروط",
    privacyPolicy: "سياسة الخصوصية",
    cookiePolicy: "سياسة ملفات تعريف الارتباط",
    errors: {
      missingCode: "رمز المصادقة (OAuth) مفقود. يرجى محاولة تسجيل الدخول مرة أخرى.",
      oauthExchangeFailed: "فشل تسجيل الدخول عبر جوجل. يرجى المحاولة مرة أخرى.",
      userNotFound: "تعذّر تحميل ملفك الشخصي. يرجى إعادة المحاولة.",
      schemaMissing: "مخطط Supabase غير موجود. نفّذ supabase/schema.sql في محرر SQL.",
      profileUpsertFailed: "تعذّر إنشاء ملفك الشخصي. يرجى إعادة المحاولة.",
      supabaseEnvMissing: "متغيرات بيئة Supabase مفقودة.",
    },
  },
};
