// Auth dictionary domain: the 4 standalone auth pages (/login, /signup,
// /forgot-password, /reset-password) — form copy, validation messages, and
// error maps for both the OAuth/email-confirm callback query params
// (`errors`) and raw Supabase Auth error codes (`authErrors`, see
// lib/auth/errors.ts). Composed into the root `Dict` by
// lib/i18n/dictionaries/index.ts.

const en = {
  auth: {
    tagline: "Personal content intelligence",
    continueWithGoogle: "Continue with Google",
    or: "or",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    newPasswordLabel: "New password",
    confirmPasswordLabel: "Confirm password",
    signIn: "Sign In",
    signUp: "Sign Up",
    supabaseMissingWarning: "Fill Supabase values in .env.local before authentication.",
    terms: "Terms",
    privacyPolicy: "Privacy Policy",
    cookiePolicy: "Cookie Policy",

    // /login
    loginHeading: "Welcome back",
    forgotPasswordLink: "Forgot password?",
    noAccountPrompt: "No account?",
    createAccountLink: "Create one",
    resendConfirmationPrompt: "Didn't get a confirmation email?",
    resendConfirmationButton: "Resend confirmation email",
    resendConfirmationSent: "Confirmation email sent — check your inbox.",

    // /signup
    signupHeading: "Create your account",
    haveAccountPrompt: "Already have an account?",
    signInLink: "Sign in",
    checkEmailHeading: "Check your email",
    checkEmailBody: "We've sent a confirmation link to activate your account.",
    resendEmailButton: "Resend email",
    resendEmailCooldown: "Resend in {seconds}s",
    existingAccountHeading: "You already have an account",
    existingAccountBody:
      "An account with this email already exists, so we didn't send a confirmation link. Sign in instead — or reset your password if you've forgotten it.",

    // /forgot-password
    forgotPasswordHeading: "Forgot your password?",
    forgotPasswordDescription: "Enter your email and we'll send you a link to reset your password.",
    sendResetLinkButton: "Send reset link",
    resetLinkGenericNotice: "If an account exists for that email, we've sent a reset link.",
    backToLogin: "Back to sign in",

    // /reset-password
    resetPasswordHeading: "Reset your password",
    resetPasswordDescription: "Choose a new password for your account.",
    resetPasswordButton: "Reset password",
    linkExpiredHeading: "Link expired",
    linkExpiredBody: "This link has expired or was already used. Request a new one.",
    requestNewLinkButton: "Request new link",

    validation: {
      passwordTooShort: "Password must be at least 8 characters.",
      passwordsDontMatch: "Passwords don't match.",
    },

    // Query-param error codes from /auth/callback and /auth/confirm redirects.
    errors: {
      missingCode: "Missing OAuth code. Please try signing in again.",
      oauthExchangeFailed: "Google sign in failed. Please try again.",
      userNotFound: "Could not load your user profile. Please retry.",
      schemaMissing: "Supabase schema is missing. Run supabase/schema.sql in SQL Editor.",
      profileUpsertFailed: "Could not create your profile. Please retry.",
      supabaseEnvMissing: "Supabase environment variables are missing.",
      confirmFailed: "This confirmation link is invalid or has expired. Please sign up again or request a new link.",
      linkExpired: "This link has expired or was already used. Request a new one.",
    },

    // Raw Supabase Auth error codes, mapped via lib/auth/errors.ts.
    authErrors: {
      invalidCredentials: "Incorrect email or password.",
      emailNotConfirmed: "Please confirm your email before signing in.",
      weakPassword: "Password is too weak. Use at least 8 characters.",
      samePassword: "New password must be different from your current password.",
      otpExpired: "This link has expired. Please request a new one.",
      overEmailSendRateLimit: "Too many requests right now. Please wait a few minutes and try again.",
      emailSendFailed:
        "We couldn't send that email — our mail provider rejected it. This is on our side, not yours. Please contact support@reelspy.dev.",
      userAlreadyExists: "This email is already registered. Sign in instead.",
      generic: "Something went wrong. Please try again.",
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
    newPasswordLabel: "كلمة المرور الجديدة",
    confirmPasswordLabel: "تأكيد كلمة المرور",
    signIn: "تسجيل الدخول",
    signUp: "إنشاء حساب",
    supabaseMissingWarning: "أدخل قيم Supabase في .env.local قبل المصادقة.",
    terms: "الشروط",
    privacyPolicy: "سياسة الخصوصية",
    cookiePolicy: "سياسة ملفات تعريف الارتباط",

    loginHeading: "مرحبًا بعودتك",
    forgotPasswordLink: "نسيت كلمة المرور؟",
    noAccountPrompt: "لا تملك حسابًا؟",
    createAccountLink: "أنشئ حسابًا",
    resendConfirmationPrompt: "لم تصلك رسالة التفعيل؟",
    resendConfirmationButton: "إعادة إرسال رسالة التفعيل",
    resendConfirmationSent: "تم إرسال رسالة التفعيل — تحقق من بريدك الوارد.",

    signupHeading: "أنشئ حسابك",
    haveAccountPrompt: "لديك حساب بالفعل؟",
    signInLink: "تسجيل الدخول",
    checkEmailHeading: "تحقق من بريدك الإلكتروني",
    checkEmailBody: "أرسلنا رابط تفعيل لحسابك.",
    resendEmailButton: "إعادة إرسال البريد",
    resendEmailCooldown: "إعادة الإرسال خلال {seconds} ثانية",
    existingAccountHeading: "لديك حساب بالفعل",
    existingAccountBody:
      "يوجد حساب مسجّل بهذا البريد الإلكتروني، لذلك لم نرسل رابط تفعيل. سجّل الدخول بدلًا من ذلك — أو أعد تعيين كلمة المرور إذا نسيتها.",

    forgotPasswordHeading: "نسيت كلمة المرور؟",
    forgotPasswordDescription: "أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.",
    sendResetLinkButton: "إرسال رابط إعادة التعيين",
    resetLinkGenericNotice: "إذا كان هناك حساب بهذا البريد، فقد أرسلنا رابط إعادة التعيين.",
    backToLogin: "العودة لتسجيل الدخول",

    resetPasswordHeading: "إعادة تعيين كلمة المرور",
    resetPasswordDescription: "اختر كلمة مرور جديدة لحسابك.",
    resetPasswordButton: "إعادة تعيين كلمة المرور",
    linkExpiredHeading: "انتهت صلاحية الرابط",
    linkExpiredBody: "انتهت صلاحية هذا الرابط أو تم استخدامه بالفعل. اطلب رابطًا جديدًا.",
    requestNewLinkButton: "طلب رابط جديد",

    validation: {
      passwordTooShort: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
      passwordsDontMatch: "كلمتا المرور غير متطابقتين.",
    },

    errors: {
      missingCode: "رمز المصادقة (OAuth) مفقود. يرجى محاولة تسجيل الدخول مرة أخرى.",
      oauthExchangeFailed: "فشل تسجيل الدخول عبر جوجل. يرجى المحاولة مرة أخرى.",
      userNotFound: "تعذّر تحميل ملفك الشخصي. يرجى إعادة المحاولة.",
      schemaMissing: "مخطط Supabase غير موجود. نفّذ supabase/schema.sql في محرر SQL.",
      profileUpsertFailed: "تعذّر إنشاء ملفك الشخصي. يرجى إعادة المحاولة.",
      supabaseEnvMissing: "متغيرات بيئة Supabase مفقودة.",
      confirmFailed: "رابط التفعيل غير صالح أو منتهي الصلاحية. يرجى إنشاء حساب مرة أخرى أو طلب رابط جديد.",
      linkExpired: "انتهت صلاحية هذا الرابط أو تم استخدامه بالفعل. اطلب رابطًا جديدًا.",
    },

    authErrors: {
      invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      emailNotConfirmed: "يرجى تفعيل بريدك الإلكتروني قبل تسجيل الدخول.",
      weakPassword: "كلمة المرور ضعيفة جدًا. استخدم 8 أحرف على الأقل.",
      samePassword: "يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور الحالية.",
      otpExpired: "انتهت صلاحية هذا الرابط. يرجى طلب رابط جديد.",
      overEmailSendRateLimit: "محاولات كثيرة جدًا الآن. يرجى الانتظار بضع دقائق ثم إعادة المحاولة.",
      emailSendFailed:
        "تعذّر إرسال البريد الإلكتروني — رفضه مزوّد البريد لدينا. المشكلة من جانبنا وليست منك. يرجى التواصل مع support@reelspy.dev.",
      userAlreadyExists: "هذا البريد الإلكتروني مسجّل بالفعل. سجّل الدخول بدلًا من ذلك.",
      generic: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
    },
  },
};
