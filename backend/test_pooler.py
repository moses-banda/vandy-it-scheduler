import asyncio
import asyncpg
import sys

async def test_conn():
    regions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1']
    for region in regions:
        host = f'aws-0-{region}.pooler.supabase.com'
        try:
            print(f"Trying {host}...")
            conn = await asyncpg.connect(
                user='postgres.jqbyomiyccbfqefvpojd',
                password='Bandesian521810',
                database='postgres',
                host=host,
                port=6543,
                timeout=5
            )
            print(f'SUCCESS: {host}')
            await conn.close()
            with open(".env", "r") as f:
                content = f.read()
            with open(".env", "w") as f:
                import re
                new_content = re.sub(
                    r"DATABASE_URL=.*", 
                    f"DATABASE_URL=postgresql+asyncpg://postgres.jqbyomiyccbfqefvpojd:Bandesian521810@{host}:6543/postgres", 
                    content
                )
                f.write(new_content)
            print("Successfully updated .env!")
            return
        except Exception as e:
            print(f'FAILED: {host} - {e}')

if __name__ == '__main__':
    asyncio.run(test_conn())
