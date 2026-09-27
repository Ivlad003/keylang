import json, subprocess, sys, os, re, base64, time
here = os.path.dirname(os.path.abspath(__file__))
pen = "/home/kosmodev/pet_project/keylang/design/keylang-ui.pen"
lib = open(f"{here}/lib.js").read() if os.path.exists(f"{here}/lib.js") else ""
cmds = ["execute({ input: %s })" % json.dumps(lib + "\n" + open(f).read()) for f in sys.argv[1:]]
cmds += ["save()", "exit()"]
args = ["pen", "interactive", "--out", pen]
if os.path.exists(pen): args[2:2] = ["--in", pen]
r = subprocess.run(args, input="\n".join(cmds) + "\n", capture_output=True, text=True, timeout=900)
out = r.stdout
n = 0
def repl(m):
    global n
    n += 1
    p = f"{here}/shot_{m.group(1)}_{int(time.time())}_{n}.png"
    open(p, "wb").write(base64.b64decode(m.group(2)))
    return f'"image": "{p}"'
out = re.sub(r'"nodeId": "([^"]+)",\s*"image": "([^"]+)"', lambda m: f'"nodeId": "{m.group(1)}", ' + repl(m), out)
out = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', out)
out = out.split("Type save() to save, exit() to quit.")[-1]
print(out[-15000:]); print(r.stderr[-3000:])
