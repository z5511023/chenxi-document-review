import json
from coze_workload_identity import Client

client = Client()
env_vars = client.get_project_env_vars()
client.close()

result = {}
for env_var in env_vars:
    result[env_var.key] = env_var.value

print(json.dumps(result))
