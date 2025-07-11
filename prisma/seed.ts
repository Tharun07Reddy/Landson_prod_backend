import { PrismaClient, PlatformType, OTPType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // Create default roles
  const adminRole = await createRoleIfNotExists('admin', 'Administrator with full access', true);
  const userRole = await createRoleIfNotExists('user', 'Regular user with limited access', true);
  
  // Create permissions
  await createPermissions();
  
  // Assign permissions to roles
  await assignPermissionsToRole(adminRole.id, 'admin');
  await assignPermissionsToRole(userRole.id, 'user');
  
  // Create admin user
  const adminUser = await createUserIfNotExists({
    email: 'admin@example.com',
    phone: '+1234567890',
    username: 'admin',
    password: 'Admin@123',
    firstName: 'Admin',
    lastName: 'User',
    isActive: true,
    isEmailVerified: true,
    isPhoneVerified: true,
    roles: ['admin']
  });
  
  // Create regular user
  const regularUser = await createUserIfNotExists({
    email: 'user@example.com',
    phone: '+1987654321',
    username: 'user',
    password: 'User@123',
    firstName: 'Regular',
    lastName: 'User',
    isActive: true,
    isEmailVerified: false,
    isPhoneVerified: false,
    roles: ['user']
  });
  
  console.log('Seeding completed successfully!');
}

// Helper function to create a role if it doesn't exist
async function createRoleIfNotExists(name: string, description: string, isSystem: boolean) {
  const existingRole = await prisma.role.findUnique({
    where: { name }
  });
  
  if (existingRole) {
    console.log(`Role '${name}' already exists.`);
    return existingRole;
  }
  
  const role = await prisma.role.create({
    data: {
      name,
      description,
      isSystem
    }
  });
  
  console.log(`Created role: ${role.name}`);
  return role;
}

// Helper function to create a user if they don't exist
async function createUserIfNotExists({
  email,
  phone,
  username,
  password,
  firstName,
  lastName,
  isActive,
  isEmailVerified,
  isPhoneVerified,
  roles
}: {
  email: string;
  phone: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  roles: string[];
}) {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { phone },
        { username }
      ]
    }
  });
  
  if (existingUser) {
    console.log(`User with email '${email}' or phone '${phone}' or username '${username}' already exists.`);
    return existingUser;
  }
  
  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Create the user
  const user = await prisma.user.create({
    data: {
      email,
      phone,
      username,
      password: hashedPassword,
      firstName,
      lastName,
      isActive,
      isEmailVerified,
      isPhoneVerified,
      platform: PlatformType.WEB,
      deviceInfo: { lastDevice: 'Seed script' }
    }
  });
  
  // Assign roles to the user
  for (const roleName of roles) {
    const role = await prisma.role.findUnique({
      where: { name: roleName }
    });
    
    if (role) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id
        }
      });
    }
  }
  
  // Create a verification OTP for non-verified users
  if (!isEmailVerified) {
    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: '123456', // Simple code for testing
        type: OTPType.EMAIL_VERIFICATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      }
    });
  }
  
  if (!isPhoneVerified) {
    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: '123456', // Simple code for testing
        type: OTPType.PHONE_VERIFICATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      }
    });
  }
  
  console.log(`Created user: ${user.email}`);
  return user;
}

// Create all permissions
async function createPermissions() {
  // Define resources and their actions
  const resources = [
    {
      name: 'users',
      actions: ['create', 'read', 'update', 'delete', 'list']
    },
    {
      name: 'roles',
      actions: ['create', 'read', 'update', 'delete', 'list', 'assign']
    },
    {
      name: 'permissions',
      actions: ['create', 'read', 'update', 'delete', 'list', 'assign']
    },
    {
      name: 'products',
      actions: ['create', 'read', 'update', 'delete', 'list']
    },
    {
      name: 'orders',
      actions: ['create', 'read', 'update', 'delete', 'list', 'process', 'cancel']
    },
    {
      name: 'payments',
      actions: ['create', 'read', 'refund', 'list']
    },
    {
      name: 'config',
      actions: ['read', 'update']
    }
  ];
  
  // Create permissions for each resource and action
  for (const resource of resources) {
    for (const action of resource.actions) {
      const permissionName = `${resource.name}:${action}`;
      const description = `Permission to ${action} ${resource.name}`;
      
      const existingPermission = await prisma.permission.findUnique({
        where: { name: permissionName }
      });
      
      if (!existingPermission) {
        await prisma.permission.create({
          data: {
            name: permissionName,
            description,
            resource: resource.name,
            action
          }
        });
        console.log(`Created permission: ${permissionName}`);
      }
    }
  }
}

// Assign permissions to a role
async function assignPermissionsToRole(roleId: string, roleName: string) {
  // Get all permissions
  const permissions = await prisma.permission.findMany();
  
  // Define permission assignments based on role
  let permissionNames: string[] = [];
  
  if (roleName === 'admin') {
    // Admin gets all permissions
    permissionNames = permissions.map(p => p.name);
  } else if (roleName === 'user') {
    // Regular users get limited permissions
    permissionNames = [
      'products:read',
      'products:list',
      'orders:create',
      'orders:read',
      'orders:list',
      'orders:cancel',
      'payments:create',
      'payments:read',
      'users:read'
    ];
  }
  
  // Assign permissions to the role
  for (const permissionName of permissionNames) {
    const permission = permissions.find(p => p.name === permissionName);
    
    if (permission) {
      const existingRolePermission = await prisma.rolePermission.findFirst({
        where: {
          roleId,
          permissionId: permission.id
        }
      });
      
      if (!existingRolePermission) {
        await prisma.rolePermission.create({
          data: {
            roleId,
            permissionId: permission.id
          }
        });
        console.log(`Assigned permission ${permissionName} to role ${roleName}`);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 