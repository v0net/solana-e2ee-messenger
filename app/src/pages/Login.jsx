import { useState } from "react";
import styles from "./css/Login.module.css";
import { useNavigate } from "react-router-dom";
import {
  encryptWithPassword,
  initializeKeysFromMnemonic,
  isValidMnemonic,
} from "../solana/solana.js";

const Login = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);
  const [passwordErrors, setPasswordErrors] = useState({
    passwordTooShort: false,
    confirmTooShort: false,
    mismatch: false,
  });
  const [mnemonic, setMnemonic] = useState(Array(12).fill(""));
  const [mnemonicInputErrors, setMnemonicInputErrors] = useState(
    Array(12).fill(false),
  );
  const [mnemonicError, setMnemonicError] = useState(false);

  const validateMnemonicInput = (index, value) => {
    const regex = /^[a-z]+$/;
    const newErrors = [...mnemonicInputErrors];
    newErrors[index] = value.length > 0 && !regex.test(value);
    setMnemonicInputErrors(newErrors);
  };

  const handleMnemonicInputChange = (index, value) => {
    let newMnemonic = [...mnemonic];
    const words = value.trim().split(/\s+/);

    if (index === 0 && words.length === 12) {
      newMnemonic = words.slice(0, 12);
      setMnemonicInputErrors(Array(12).fill(false));
    } else {
      newMnemonic[index] = value.replace(/\s/g, "");
    }

    setMnemonicError(false);
    setMnemonic(newMnemonic);
  };

  const handleSubmitMnemonic = () => {
    let allFilled = true;
    const newErrors = [...mnemonicInputErrors];

    for (let i = 0; i < 12; i++) {
      if (mnemonic[i].trim() === "") {
        newErrors[i] = true;
        allFilled = false;
      }
    }

    setMnemonicInputErrors(newErrors);

    if (allFilled) {
      if (!isValidMnemonic(mnemonic)) {
        setMnemonicInputErrors(Array(12).fill(true));
        setMnemonicError(true);
        return;
      }
      setMnemonicError(false);
      setStep(2);
    }
  };

  const handleSubmitPassword = async () => {
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

  const validatePassword = (password, confirmPassword) => {
    setPasswordErrors({
      passwordTooShort: password.length > 0 && password.length < 8,
      confirmTooShort: confirmPassword.length > 0 && confirmPassword.length < 8,
      mismatch: password && confirmPassword && password !== confirmPassword,
    });
  };

  const clearMnemonicInputErrorOnFocus = (index) => {
    const newErrors = [...mnemonicInputErrors];
    newErrors[index] = false;
    setMnemonicInputErrors(newErrors);
  };

  const togglePasswordVisibility = (field) => {
    if (field === "password") {
      setIsPasswordVisible(!isPasswordVisible);
    } else {
      setIsConfirmPasswordVisible(!isConfirmPasswordVisible);
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        <div key={step} className={styles.formCard}>
          {step === 1 ? (
            <>
              <h2 className={`${styles.title} ${styles.loginTitle}`}>Login</h2>
              <div
                className={`${styles.mnemonicContainer} ${styles.formGroup}`}
              >
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className={`${styles.mnemonicInputWrapper} ${mnemonicInputErrors[i] ? styles.error : ""}`}
                  >
                    <div className={styles.mnemonicIndexLabel}>{i + 1}</div>
                    <input
                      type="text"
                      name={`word-${i + 1}`}
                      required
                      className={styles.mnemonicInput}
                      autoComplete="off"
                      value={mnemonic[i]}
                      onChange={(e) =>
                        handleMnemonicInputChange(i, e.target.value)
                      }
                      onBlur={(e) => validateMnemonicInput(i, e.target.value)}
                      onFocus={() => clearMnemonicInputErrorOnFocus(i)}
                    />
                  </div>
                ))}
                {mnemonicError && (
                  <div
                    className={styles.errorMessage}
                    style={{ textAlign: "center", marginBottom: "15px" }}
                  >
                    Invalid recovery phrase. Please check your words.
                  </div>
                )}
              </div>
              <div className={styles.buttonsContainer}>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  type="submit"
                  onClick={handleSubmitMnemonic}
                >
                  Next
                </button>
                <button
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  type="button"
                  onClick={() => navigate("/register")}
                >
                  Register
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
                  onClick={handleSubmitPassword}
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

export default Login;
