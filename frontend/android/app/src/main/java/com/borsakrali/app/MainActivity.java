package com.borsakrali.app;

import android.content.Intent;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

/**
 * Capgo SocialLogin plugin'i Google scope'ları çağırırken
 * onActivityResult'i kendi handler'ına yönlendirir. Bu olmadan
 * "You CANNOT use scopes without modifying the main activity" hatası alınır.
 *
 * Kaynak: https://github.com/Cap-go/capacitor-social-login (Android setup)
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin plugin handle is null");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "Plugin instance is not SocialLoginPlugin");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }
}
