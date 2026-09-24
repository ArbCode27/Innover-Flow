"use client";

import { useEffect, useState } from "react";

type FacebookSdkStatus = "idle" | "loading" | "ready" | "error";

type FacebookLoginResponse = {
  status?: string;
  authResponse?: {
    code?: string;
    accessToken?: string;
  } | null;
};

type FacebookLoginOptions = {
  config_id: string;
  response_type: "code";
  override_default_response_type: boolean;
  extras: {
    setup: Record<string, unknown>;
    featureType: "whatsapp_business_app_onboarding";
    sessionInfoVersion?: "3";
  };
};

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (options: {
        appId: string;
        cookie: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: FacebookLoginOptions,
      ) => void;
    };
  }
}

const SCRIPT_ID = "facebook-jssdk";
const SCRIPT_SRC = "https://connect.facebook.net/es_LA/sdk.js";

export const useFacebookSdk = (appId: string, graphVersion: string) => {
  const [status, setStatus] = useState<FacebookSdkStatus>("idle");

  useEffect(() => {
    if (!appId || !graphVersion) {
      setStatus("idle");
      return;
    }

    const initSdk = () => {
      if (!window.FB) {
        setStatus("error");
        return;
      }
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version: graphVersion,
      });
      setStatus("ready");
    };

    if (window.FB) {
      initSdk();
      return;
    }

    window.fbAsyncInit = initSdk;
    setStatus("loading");

    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => setStatus("error");
    document.body.appendChild(script);
  }, [appId, graphVersion]);

  return status;
};
