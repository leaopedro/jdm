import os
import json
import subprocess
from datetime import datetime, timedelta

PAPERCLIP_API_URL = os.environ.get("PAPERCLIP_API_URL")
PAPERCLIP_API_KEY = os.environ.get("PAPERCLIP_API_KEY")
PAPERCLIP_COMPANY_ID = os.environ.get("PAPERCLIP_COMPANY_ID")

if not all([PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_COMPANY_ID]):
    print("Error: PAPERCLIP_API_URL, PAPERCLIP_API_KEY, or PAPERCLIP_COMPANY_ID not set.")
    exit(1)

AGENT_IDS = {
    "CEO": "d08e0e62-a55e-4e5d-a766-0d0a230d4751",
    "CTO": "3e9befda-5906-4190-b12e-220cb5dd65a3",
    "Vega": "da23038f-b00d-4480-8080-eee90b31e20a",
    "Atlas": "5df069c4-aec2-46b5-804c-c3b881252e6d",
}

STATUSES = ["in_progress", "in_review", "blocked", "todo"]

def run_command(command):
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error executing command: {command}")
        print(result.stderr)
        return None
    return result.stdout

def fetch_issues_for_agent(agent_id, status):
    command = f"curl -s -H 'Authorization: Bearer {PAPERCLIP_API_KEY}' '{PAPERCLIP_API_URL}/api/companies/{PAPERCLIP_COMPANY_ID}/issues?assigneeAgentId={agent_id}&status={status}&limit=100'"
    output = run_command(command)
    if output:
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            print(f"Error decoding JSON for issues for agent {agent_id}, status {status}")
            return []
    return []

def fetch_runs_for_issue(issue_id):
    command = f"curl -s -H 'Authorization: Bearer {PAPERCLIP_API_KEY}' '{PAPERCLIP_API_URL}/api/issues/{issue_id}/runs?limit=5&sort=createdAt%3Adesc'"
    output = run_command(command)
    if output:
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            print(f"Error decoding JSON for runs for issue {issue_id}")
            return []
    return []

def analyze_stalls():
    all_issues = {}
    
    for agent_name, agent_id in AGENT_IDS.items():
        print(f"Fetching issues for {agent_name} ({agent_id})...")
        for status in STATUSES:
            issues = fetch_issues_for_agent(agent_id, status)
            for issue in issues:
                all_issues[issue['id']] = issue

    stalled_agents = {}

    for issue_id, issue in all_issues.items():
        assignee_agent_id = issue.get("assigneeAgentId")
        if assignee_agent_id in AGENT_IDS.values():
            runs = fetch_runs_for_issue(issue_id)
            
            zero_token_runs = []
            for run in runs:
                if (run.get("status") == "succeeded" or run.get("status") == "failed") and run.get("invocationSource") == "automation":
                    usage_data = run.get("usageJson")
                    if usage_data:
                        try:
                            input_tokens = usage_data.get("inputTokens", 0)
                            output_tokens = usage_data.get("outputTokens", 0)
                            billing_type = usage_data.get("billingType")

                            if input_tokens == 0 and output_tokens == 0 and billing_type == "subscription_included":
                                zero_token_runs.append(run)
                            else:
                                # A successful run with tokens resets the count
                                zero_token_runs = [] 
                        except AttributeError:
                            print(f"Warning: usageJson for run {run['id']} of issue {issue_id} is not a dictionary: {usage_data}")
                    else:
                        # If usageJson is missing, it could be a zero-token run, but let's be conservative and only count explicit zero-token runs
                        pass
                
                if len(zero_token_runs) >= 3:
                    agent_name = next(name for name, id_val in AGENT_IDS.items() if id_val == assignee_agent_id)
                    stalled_agents[assignee_agent_id] = {
                        "agent_name": agent_name,
                        "issue_id": issue_id,
                        "issue_identifier": issue.get("identifier"),
                        "issue_title": issue.get("title"),
                        "zero_token_runs_count": len(zero_token_runs),
                        "last_runs": zero_token_runs,
                    }
                    break # Only need to detect one stalled issue per agent

    if stalled_agents:
        print("""
--- Stalled Agents Detected ---""")
        for agent_id, data in stalled_agents.items():
            print(f"Agent: {data['agent_name']} ({agent_id})")
            print(f"  Stalled on Issue: {data['issue_identifier']} - {data['issue_title']}")
            print(f"  Consecutive Zero-Token Runs: {data['zero_token_runs_count']}")
            print("  Details of last zero-token runs:")
            for run in data['last_runs']:
                print(f"    Run ID: {run['id']}, CreatedAt: {run['createdAt']}")
        return True
    else:
        print("""
No stalled agents detected.""")
        return False

if __name__ == "__main__":
    analyze_stalls()
