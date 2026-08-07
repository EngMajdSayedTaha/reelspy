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
    resendConfirmationPrompt: "Haven't confirmed your email yet?",
    resendConfirmationButton: "Email me a verification code",

    // /signup
    signupHeading: "Create your account",
    haveAccountPrompt: "Already have an account?",
    signInLink: "Sign in",
    existingAccountHeading: "You already have an account",
    existingAccountBody:
      "An account with this email already exists, so we didn't send a verification code. Sign in instead — or reset your password if you've forgotten it.",

    // Emailed 6-digit code step (components/auth/EmailOtpStep.tsx), shared by
    // /signup and the unconfirmed-account branch of /login.
    verifyEmailHeading: "Enter your verification code",
    verifyEmailBody: "We sent a 6-digit code to {email}. Enter it below to activate your account.",
    otpInputLabel: "Verification code digit",
    verifyCodeButton: "Verify and continue",
    noCodePrompt: "No code yet? Check your spam folder.",
    resendCodeButton: "Send a new code",
    resendCodeCooldown: "Send a new code in {seconds}s",
    codeResent: "New code sent — check your inbox.",
    wrongEmailPrompt: "Wrong email?",
    changeEmailLink: "Use a different address",

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

    // Admin-forced reset (app/api/admin/users/[id]/force-reset,
    // .../force-reset-all): shown on /reset-password when a signed-in user
    // was redirected here by middleware because of profiles.force_password_reset.
    forcedResetNotice:
      "An administrator required you to set a new password before continuing. Please choose one below.",
    forcedResetRetryNotice:
      "Your password was updated, but we couldn't finish reactivating your account. Try again.",
    forcedResetRetryButton: "Continue",

    validation: {
      passwordRequirement: "At least 10 characters, with uppercase, lowercase, a number, and a symbol.",
      passwordIssues: {
        length: "At least 10 characters.",
        uppercase: "At least one uppercase letter.",
        lowercase: "At least one lowercase letter.",
        number: "At least one number.",
        symbol: "At least one symbol (e.g. ! ? # %).",
        common: "This password is too common — choose something less predictable.",
        containsEmail: "Password can't contain your email address.",
      },
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
      sessionExpired: "Your session expired. Sign in again to connect your account.",
    },

    // Raw Supabase Auth error codes, mapped via lib/auth/errors.ts.
    authErrors: {
      invalidCredentials: "Incorrect email or password.",
      emailNotConfirmed: "Please confirm your email before signing in.",
      weakPassword: "Password is too weak. Use at least 8 characters.",
      samePassword: "New password must be different from your current password.",
      // GoTrue answers a wrong code and an expired one with the same
      // `otp_expired` — on purpose, so guessing tells an attacker nothing. The
      // two strings are the same error on its two surfaces: an emailed link
      // and a typed code (see OtpSurface in lib/auth/errors.ts).
      otpExpired: "This link is invalid or has expired. Please request a new one.",
      invalidOtp: "That code is wrong or has expired. Request a new one.",
      overEmailSendRateLimit: "Too many requests right now. Please wait a few minutes and try again.",
      overRequestRateLimit: "Too many attempts. Please wait a few minutes and try again.",
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
    resendConfirmationPrompt: "لم تفعّل بريدك الإلكتروني بعد؟",
    resendConfirmationButton: "أرسل لي رمز تحقق",

    signupHeading: "أنشئ حسابك",
    haveAccountPrompt: "لديك حساب بالفعل؟",
    signInLink: "تسجيل الدخول",
    existingAccountHeading: "لديك حساب بالفعل",
    existingAccountBody:
      "يوجد حساب مسجّل بهذا البريد الإلكتروني، لذلك لم نرسل رمز تحقق. سجّل الدخول بدلًا من ذلك — أو أعد تعيين كلمة المرور إذا نسيتها.",

    verifyEmailHeading: "أدخل رمز التحقق",
    verifyEmailBody: "أرسلنا رمزًا من 6 أرقام إلى {email}. أدخله أدناه لتفعيل حسابك.",
    otpInputLabel: "خانة رمز التحقق",
    verifyCodeButton: "تحقّق وتابع",
    noCodePrompt: "لم يصلك الرمز؟ تحقق من مجلد البريد غير المرغوب فيه.",
    resendCodeButton: "إرسال رمز جديد",
    resendCodeCooldown: "إرسال رمز جديد خلال {seconds} ثانية",
    codeResent: "تم إرسال رمز جديد — تحقق من بريدك الوارد.",
    wrongEmailPrompt: "البريد الإلكتروني غير صحيح؟",
    changeEmailLink: "استخدم عنوانًا آخر",

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

    forcedResetNotice:
      "طلب منك أحد المسؤولين تعيين كلمة مرور جديدة قبل المتابعة. يرجى اختيار واحدة أدناه.",
    forcedResetRetryNotice:
      "تم تحديث كلمة المرور، لكن تعذّر علينا إكمال إعادة تفعيل حسابك. حاول مرة أخرى.",
    forcedResetRetryButton: "متابعة",

    validation: {
      passwordRequirement: "10 أحرف على الأقل، تتضمن حرفًا كبيرًا وحرفًا صغيرًا ورقمًا ورمزًا.",
      passwordIssues: {
        length: "10 أحرف على الأقل.",
        uppercase: "حرف كبير واحد على الأقل.",
        lowercase: "حرف صغير واحد على الأقل.",
        number: "رقم واحد على الأقل.",
        symbol: "رمز واحد على الأقل (مثل ! ? # %).",
        common: "كلمة المرور هذه شائعة جدًا — اختر كلمة أصعب تخمينًا.",
        containsEmail: "لا يمكن أن تحتوي كلمة المرور على بريدك الإلكتروني.",
      },
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
      sessionExpired: "انتهت صلاحية جلستك. سجّل الدخول مرة أخرى لربط حسابك.",
    },

    authErrors: {
      invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      emailNotConfirmed: "يرجى تفعيل بريدك الإلكتروني قبل تسجيل الدخول.",
      weakPassword: "كلمة المرور ضعيفة جدًا. استخدم 8 أحرف على الأقل.",
      samePassword: "يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور الحالية.",
      otpExpired: "هذا الرابط غير صالح أو انتهت صلاحيته. يرجى طلب رابط جديد.",
      invalidOtp: "هذا الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا.",
      overEmailSendRateLimit: "محاولات كثيرة جدًا الآن. يرجى الانتظار بضع دقائق ثم إعادة المحاولة.",
      overRequestRateLimit: "محاولات كثيرة جدًا. يرجى الانتظار بضع دقائق ثم إعادة المحاولة.",
      emailSendFailed:
        "تعذّر إرسال البريد الإلكتروني — رفضه مزوّد البريد لدينا. المشكلة من جانبنا وليست منك. يرجى التواصل مع support@reelspy.dev.",
      userAlreadyExists: "هذا البريد الإلكتروني مسجّل بالفعل. سجّل الدخول بدلًا من ذلك.",
      generic: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
    },
  },
};
