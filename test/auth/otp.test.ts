import { describe, it, expect } from "vitest";
import {
  OTP_LENGTH,
  applyOtpBackspace,
  applyOtpInput,
  applyOtpPaste,
  isCompleteOtp,
  normalizeOtp,
} from "@/lib/auth/otp";

describe("normalizeOtp", () => {
  it("keeps digits in order and drops everything else", () => {
    expect(normalizeOtp("123456")).toBe("123456");
    expect(normalizeOtp("123 456")).toBe("123456");
    expect(normalizeOtp("123-456")).toBe("123456");
    // The whole line someone highlights in the email.
    expect(normalizeOtp("Your ReelSpy code is 123456")).toBe("123456");
  });

  it("never exceeds the code length", () => {
    expect(normalizeOtp("1234567890")).toHaveLength(OTP_LENGTH);
    expect(normalizeOtp("1234567890")).toBe("123456");
  });
});

describe("isCompleteOtp", () => {
  it("is true only at exactly six digits", () => {
    expect(isCompleteOtp("12345")).toBe(false);
    expect(isCompleteOtp("123456")).toBe(true);
    expect(isCompleteOtp("12 34 56")).toBe(true);
    expect(isCompleteOtp("")).toBe(false);
    expect(isCompleteOtp("abcdef")).toBe(false);
  });
});

describe("applyOtpInput", () => {
  it("types digit by digit, advancing the focused box", () => {
    let state = { value: "", caret: 0 };
    for (const digit of "123456") {
      state = applyOtpInput(state.value, state.caret, digit);
    }
    expect(state.value).toBe("123456");
  });

  it("replaces the digit in the box instead of pushing the rest along", () => {
    expect(applyOtpInput("123456", 2, "9")).toEqual({ value: "129456", caret: 3 });
  });

  it("ignores a keystroke that isn't a digit", () => {
    // Letters produce an empty box; the code stays put rather than losing a digit.
    expect(applyOtpInput("1", 0, "a")).toEqual({ value: "", caret: 0 });
    expect(applyOtpInput("", 0, "a")).toEqual({ value: "", caret: 0 });
  });

  it("drops the digit already in the box when the browser appends instead of replacing", () => {
    // Box 0 held "1" and the browser reported "12" — the keystroke was a "2".
    expect(applyOtpInput("1", 0, "12")).toEqual({ value: "2", caret: 1 });
  });

  it("fills forward when several digits land in one box (autofill / Android batching)", () => {
    expect(applyOtpInput("", 0, "123456")).toEqual({ value: "123456", caret: 6 });
    // A partial batch overwrites from the focused box, never shifting the code.
    expect(applyOtpInput("111111", 2, "99")).toEqual({ value: "119911", caret: 4 });
  });
});

describe("applyOtpBackspace", () => {
  it("clears the focused box when it holds a digit", () => {
    expect(applyOtpBackspace("123456", 5)).toEqual({ value: "12345", caret: 5 });
  });

  it("eats the previous digit when the focused box is already empty", () => {
    expect(applyOtpBackspace("123", 3)).toEqual({ value: "12", caret: 2 });
  });

  it("does nothing at the start of an empty code", () => {
    expect(applyOtpBackspace("", 0)).toEqual({ value: "", caret: 0 });
  });

  it("closes the gap when a middle digit is deleted", () => {
    // Box 1 of "123456" cleared leaves "13456" — the remaining digits shift
    // left so there is never a hole in the middle of the code.
    expect(applyOtpBackspace("123456", 1)).toEqual({ value: "13456", caret: 1 });
  });
});

describe("applyOtpPaste", () => {
  it("fills the whole code from the start regardless of the focused box", () => {
    expect(applyOtpPaste("", 3, "123456")).toEqual({ value: "123456", caret: 6 });
    expect(applyOtpPaste("999999", 4, "123456")).toEqual({ value: "123456", caret: 6 });
  });

  it("strips the noise around a copied code", () => {
    expect(applyOtpPaste("", 0, "Your ReelSpy code is 123456 ")).toEqual({
      value: "123456",
      caret: 6,
    });
  });

  it("drops a partial paste at the focused box", () => {
    expect(applyOtpPaste("12", 2, "34")).toEqual({ value: "1234", caret: 4 });
  });

  it("leaves the field alone when the clipboard holds no digits", () => {
    expect(applyOtpPaste("12", 2, "no code here")).toBeNull();
  });
});
