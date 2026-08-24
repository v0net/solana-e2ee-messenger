import { useState, useEffect } from "react";
import styles from "./css/Register.module.css";
import { useNavigate } from "react-router-dom";
import {
  generateMnemonic,
  encryptWithPassword,
  initializeKeysFromMnemonic,
} from "../solana/solana.js";

const Register = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [mnemonic] = useState(() => generateMnemonic());
  const [isMnemonicSaved, setIsMnemonicSaved] = useState(false);
  const [isCopyNotificationVisible, setIsCopyNotificationVisible] =
    useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({
    passwordTooShort: false,
    confirmTooShort: false,
    mismatch: false,
  });
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);

  useEffect(() => {
    let timeoutId;

    if (isCopyNotificationVisible) {
      timeoutId = setTimeout(() => setIsCopyNotificationVisible(false), 2000);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isCopyNotificationVisible]);

  const handleMnemonicCopy = () => {
    navigator.clipboard.writeText(mnemonic.join(" "));
    setIsCopyNotificationVisible(true);
  };

  const validatePassword = (password, confirmPassword) => {
    setPasswordErrors({
      passwordTooShort: password.length > 0 && password.length < 8,
      confirmTooShort: confirmPassword.length > 0 && confirmPassword.length < 8,
      mismatch: password && confirmPassword && password !== confirmPassword,
    });
  };

  const togglePasswordVisibility = (field) => {
    if (field === "password") {
      setIsPasswordVisible(!isPasswordVisible);
    } else {
      setIsConfirmPasswordVisible(!isConfirmPasswordVisible);
    }
  };

  const submitPassword = async () => {
    const newErrors = {
      passwordTooShort: password.length < 8,
      confirmTooShort: confirmPassword.length < 8,
      mismatch: password !== confirmPassword,
    };
    setPasswordErrors(newErrors);
    if (
      !newErrors.passwordTooShort &&
      !newErrors.confirmTooShort &&
      !newErrors.mismatch
    ) {
      initializeKeysFromMnemonic(mnemonic);
      localStorage.setItem(
        "encryptedMnemonic",
        JSON.stringify(
          await encryptWithPassword(JSON.stringify(mnemonic), password),
        ),
      );
      navigate("/");
    }
  };

  return (
    <div className={styles.pageWrapper}>
      {isCopyNotificationVisible && (
        <div className={styles.copyNotification}>
          Mnemonic phrase copied to clipboard
        </div>
      )}
      <div className={styles.container}>
        <div key={step} className={styles.formCard}>
          {step === 1 ? (
            <>
              <h2 className={`${styles.title} ${styles.registerTitle}`}>
                Register
              </h2>
              <div
                className={`${styles.mnemonicContainer} ${styles.formGroup}`}
              >
                {mnemonic.map((word, index) => (
                  <div key={index} className={styles.mnemonicInputWrapper}>
                    <div className={styles.mnemonicIndexLabel}>{index + 1}</div>
                    <input
                      type="text"
                      name={`word-${index + 1}`}
                      required
                      readOnly
                      value={word}
                      className={styles.mnemonicInput}
                    />
                  </div>
                ))}
              </div>
              <div className={`${styles.formGroup} ${styles.rememberMnemonic}`}>
                <input
                  type="checkbox"
                  className={styles.remember}
                  name="remember"
                  checked={isMnemonicSaved}
                  onChange={() => setIsMnemonicSaved(!isMnemonicSaved)}
                />
                <label>I have saved my recovery phrase</label>
              </div>
              <div className={styles.buttonsContainer}>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  type="submit"
                  onClick={() => setStep(2)}
                  disabled={!isMnemonicSaved}
                >
                  Next
                </button>
                <button
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  type="button"
                  onClick={handleMnemonicCopy}
                >
                  Copy
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className={`${styles.title} ${styles.passwordTitle}`}>
                Set a Password
              </h2>
              <div className={styles.passwordRequirement}>
                It must be at least 8 characters
              </div>
              <div className={styles.formGroup}>
                <div className={styles.passwordInputWrapper}>
                  <label className={styles.passwordInputLabel}>Password</label>
                  <div className={styles.passwordFieldContainer}>
                    <input
                      type={isPasswordVisible ? "text" : "password"}
                      className={styles.passwordInput}
                      value={password}
                      onChange={(e) => {
                        const newPass = e.target.value;
                        setPassword(newPass);
                        validatePassword(newPass, confirmPassword);
                      }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => togglePasswordVisibility("password")}
                    >
                      <span className="material-icons">
                        {isPasswordVisible ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                  {passwordErrors.passwordTooShort && (
                    <div className={styles.errorMessage}>
                      Password must be at least 8 characters
                    </div>
                  )}
                </div>
                <div className={styles.passwordInputWrapper}>
                  <label className={styles.passwordInputLabel}>
                    Confirm Password
                  </label>
                  <div className={styles.passwordFieldContainer}>
                    <input
                      type={isConfirmPasswordVisible ? "text" : "password"}
                      className={styles.passwordInput}
                      value={confirmPassword}
                      onChange={(e) => {
                        const newConfirm = e.target.value;
                        setConfirmPassword(newConfirm);
                        validatePassword(password, newConfirm);
                      }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => togglePasswordVisibility("confirm")}
                    >
                      <span className="material-icons">
                        {isConfirmPasswordVisible
                          ? "visibility_off"
                          : "visibility"}
                      </span>
                    </button>
                  </div>
                  {passwordErrors.confirmTooShort ? (
                    <div className={styles.errorMessage}>
                      Password must be at least 8 characters
                    </div>
                  ) : passwordErrors.mismatch ? (
                    <div className={styles.errorMessage}>
                      Passwords do not match
                    </div>
                  ) : null}
                </div>
              </div>
              <div className={styles.buttonContainer}>
                <button
                  className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonPassword}`}
                  type="submit"
                  onClick={submitPassword}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;
