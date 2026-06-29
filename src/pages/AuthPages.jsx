import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Lock, Mail, User, Phone, ShieldCheck, Database, KeyRound } from "lucide-react";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "590748154695-kacpcrn0q5nbe4jmq4i7d1hce6v86i3i.apps.googleusercontent.com";

function GoogleLoginButton({ onSuccess, clientId }) {
  const containerRef = useRef(null);
  const [isGsiLoaded, setIsGsiLoaded] = useState(false);

  useEffect(() => {
    const checkGsi = () => {
      if (window.google && window.google.accounts) {
        setIsGsiLoaded(true);
        return true;
      }
      return false;
    };

    if (checkGsi()) return;

    const interval = setInterval(() => {
      if (checkGsi()) {
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isGsiLoaded && clientId && containerRef.current) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            onSuccess(response.credential);
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "filled_blue",
          size: "large",
          width: 320,
          text: "signin_with",
          shape: "pill",
        });
      } catch (err) {
        console.error("Google GIS rendering error:", err);
      }
    }
  }, [isGsiLoaded, clientId, onSuccess]);

  return (
    <div className="w-full flex justify-center min-h-[44px]">
      {isGsiLoaded ? (
        <div ref={containerRef} className="w-full flex justify-center" />
      ) : (
        <div className="text-xs text-muted-foreground animate-pulse py-2">Loading Google Sign-in...</div>
      )}
    </div>
  );
}

export default function AuthPages() {
  const { login, signup, googleLogin } = useAuth();
  const [activeTab, setActiveTab] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Login Form States
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup Form States
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupRole, setSignupRole] = useState("sales_executive");

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error("Please fill in all credentials");
      return;
    }

    setIsLoading(true);
    try {
      await login(loginEmail, loginPassword);
      toast.success("Welcome back to PropFin!");
    } catch (err) {
      toast.error(err.message || "Failed to log in. Check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!signupName || !signupEmail || !signupPassword || !signupRole) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      await signup({
        full_name: signupName,
        email: signupEmail,
        password: signupPassword,
        role: signupRole,
        phone: signupPhone || undefined,
      });
      toast.success("Account created successfully!");
    } catch (err) {
      toast.error(err.message || "Sign up failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credential) => {
    setIsLoading(true);
    try {
      await googleLogin(credential);
      toast.success("Successfully authenticated with Google!");
    } catch (err) {
      toast.error(err.message || "Google authentication failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen flex items-center justify-center bg-slate-950 overflow-y-auto px-4 py-8 select-none">
      {/* Decorative Background Elements */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[35rem] h-[35rem] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[35rem] h-[35rem] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md my-auto">
        {/* Branding header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20 border border-blue-400/20">
            <Database className="text-white h-7 w-7" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">PropFin</h1>
          <p className="text-slate-400 text-xs mt-1 font-medium tracking-wide uppercase">Property Financials & Compliance Engine</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 bg-slate-900 border border-slate-800/80 p-1 rounded-xl h-11 mb-6">
            <TabsTrigger value="login" className="rounded-lg text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all text-xs font-semibold">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="signup" className="rounded-lg text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all text-xs font-semibold">
              Sign Up
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-blue-500" /> Welcome Back
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Enter your email or employee code to access your workspace.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-4 pt-0">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-slate-300 text-xs font-semibold">Email or Employee Code</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        id="login-email"
                        type="text"
                        placeholder="name@company.com or EMP-1234"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10 bg-slate-950/80 border-slate-800 text-slate-200 focus-visible:ring-blue-500 text-xs h-10"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="login-password" className="text-slate-300 text-xs font-semibold">Password</Label>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10 pr-10 bg-slate-950/80 border-slate-800 text-slate-200 focus-visible:ring-blue-500 text-xs h-10"
                        required
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all h-10 text-xs" disabled={isLoading}>
                    {isLoading ? "Signing In..." : "Sign In to Workspace"}
                  </Button>

                  <div className="relative w-full flex items-center justify-center py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-800" />
                    </div>
                    <span className="relative z-10 px-3 bg-[#0d1527] text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Or login with
                    </span>
                  </div>

                  <GoogleLoginButton onSuccess={handleGoogleSuccess} clientId={googleClientId} />
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="signup">
            <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-500" /> Register Account
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Create your profile to access PropFin's tracking tools.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSignup}>
                <CardContent className="space-y-4 pt-0">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-slate-300 text-xs font-semibold">Full Name *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="John Doe"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        className="pl-10 bg-slate-950/80 border-slate-800 text-slate-200 focus-visible:ring-blue-500 text-xs h-10"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-slate-300 text-xs font-semibold">Email Address *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="john.doe@company.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="pl-10 bg-slate-950/80 border-slate-800 text-slate-200 focus-visible:ring-blue-500 text-xs h-10"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-phone" className="text-slate-300 text-xs font-semibold">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                          id="signup-phone"
                          type="tel"
                          placeholder="9876543210"
                          value={signupPhone}
                          onChange={(e) => setSignupPhone(e.target.value)}
                          className="pl-10 bg-slate-950/80 border-slate-800 text-slate-200 focus-visible:ring-blue-500 text-xs h-10"
                          disabled={isLoading}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-role" className="text-slate-300 text-xs font-semibold">Work Role *</Label>
                      <Select value={signupRole} onValueChange={setSignupRole} disabled={isLoading}>
                        <SelectTrigger className="bg-slate-950/80 border-slate-800 text-slate-200 focus:ring-blue-500 text-xs h-10">
                          <SelectValue placeholder="Select Role" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                          <SelectItem value="admin">Administrator</SelectItem>
                          <SelectItem value="sales_executive">Sales Executive</SelectItem>
                          <SelectItem value="finance">Finance Officer</SelectItem>
                          <SelectItem value="compliance">Compliance Auditor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-slate-300 text-xs font-semibold">Secure Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="pl-10 pr-10 bg-slate-950/80 border-slate-800 text-slate-200 focus-visible:ring-blue-500 text-xs h-10"
                        required
                        minLength={8}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all h-10 text-xs" disabled={isLoading}>
                    {isLoading ? "Creating Account..." : "Create Account"}
                  </Button>

                  <div className="relative w-full flex items-center justify-center py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-800" />
                    </div>
                    <span className="relative z-10 px-3 bg-[#0d1527] text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Or sign up with
                    </span>
                  </div>

                  <GoogleLoginButton onSuccess={handleGoogleSuccess} clientId={googleClientId} />
                </CardFooter>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
